/**
 * GitHub Contents API 的最小封装
 * ------------------------------
 * 写作页与删除按钮都需要「读 sha → 写 / 删」这一套流程，集中在这里避免各处重复实现。
 *
 * 关键约束（曾在这里踩过坑）：
 *   - 更新或删除已存在的文件时**必须带上该文件的 sha**，否则接口返回 422；
 *   - 文件内容要以 UTF-8 转 Base64，中文不能直接用 btoa（它只接受 Latin-1）；
 *   - 错误码要翻译成用户看得懂的提示，而不是把 422 直接甩给作者。
 */

import { postPath, repository } from "./config";

const apiBase = "https://api.github.com";

/** 带用户可读提示的接口错误。 */
export class GitHubApiError extends Error {
  status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
  }
}

type GitHubRequest = {
  /** 相对仓库根目录的路径，例如 `content/posts/welcome.md` */
  path: string;
  token: string;
  method?: "GET" | "PUT" | "DELETE";
  body?: unknown;
};

async function request({
  path,
  token,
  method = "GET",
  body,
}: GitHubRequest): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  try {
    return await fetch(
      `${apiBase}/repos/${repository.owner}/${repository.name}/contents/${path}`,
      {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
  } catch {
    throw new GitHubApiError("网络请求失败，请检查网络连接后重试。");
  }
}

/** 把 HTTP 状态码翻译成操作者能看懂的提示。 */
function describeStatus(status: number, action: "read" | "write" | "delete") {
  if (status === 401) return "Token 无效或已过期，请重新生成。";
  if (status === 403)
    return "Token 权限不足，需要目标仓库的 Contents: Read and write。";
  if (status === 404)
    return "找不到仓库，请检查 Token 是否有权访问该仓库。";
  if (status === 422)
    return "文件名冲突：仓库中已存在同名文章，请换个标题或选择更新原文。";
  if (action === "read") return "读取文章失败，请稍后重试。";
  if (action === "delete") return "删除失败，请检查 Token 权限和仓库地址。";
  return "发布失败，请检查 Token 权限和仓库地址。";
}

/** 文本按 UTF-8 转 Base64，保证中文内容不被破坏。 */
function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

/**
 * 读取仓库中某个文章的 sha。
 * 返回 `null` 表示文件不存在；其它异常会抛出，交由调用方决定怎么提示。
 */
export async function getFileSha(
  slug: string,
  token: string,
): Promise<string | null> {
  const response = await request({ path: postPath(slug), token });
  if (response.status === 404) return null;
  if (!response.ok)
    throw new GitHubApiError(
      describeStatus(response.status, "read"),
      response.status,
    );
  const data = (await response.json()) as { sha?: string };
  return data.sha ?? null;
}

/**
 * 列出仓库中已有的文章文件名。
 * 用来发现「仓库里已存在、但当前构建产物还没有」的文件，避免悄悄覆盖旧文章。
 * 令牌不可用时返回空数组：真正的权限问题会由后续写入请求报告。
 */
export async function listPostSlugs(token: string): Promise<string[]> {
  const response = await request({
    path: repository.postsDirectory,
    token,
  });
  if (!response.ok) return [];
  const entries = (await response.json()) as { name?: string }[];
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => entry.name ?? "")
    .filter((name) => name.toLowerCase().endsWith(".md"))
    .map((name) => name.slice(0, -3))
    .filter(Boolean);
}

export type PutPostOptions = {
  slug: string;
  token: string;
  /** 完整 Markdown（含 Front Matter） */
  markdown: string;
  /** 提交信息 */
  message: string;
  /** 更新已存在的文件时必须提供 */
  sha?: string;
};

/** 写入（新建或更新）一篇文章。 */
export async function putPost(options: PutPostOptions): Promise<void> {
  const response = await request({
    path: postPath(options.slug),
    token: options.token,
    method: "PUT",
    body: {
      message: options.message,
      content: encodeBase64(options.markdown),
      ...(options.sha ? { sha: options.sha } : {}),
    },
  });
  if (!response.ok)
    throw new GitHubApiError(
      describeStatus(response.status, "write"),
      response.status,
    );
}

export type DeletePostOptions = {
  slug: string;
  token: string;
  message: string;
};

/** 删除一篇文章。内部会先取 sha，删除接口要求提供它。 */
export async function deletePost(options: DeletePostOptions): Promise<void> {
  const sha = await getFileSha(options.slug, options.token);
  if (!sha)
    throw new GitHubApiError(
      "未找到该文章文件，或 Token 没有访问该仓库的权限。",
      404,
    );

  const response = await request({
    path: postPath(options.slug),
    token: options.token,
    method: "DELETE",
    body: { message: options.message, sha },
  });
  if (!response.ok)
    throw new GitHubApiError(
      describeStatus(response.status, "delete"),
      response.status,
    );
}
