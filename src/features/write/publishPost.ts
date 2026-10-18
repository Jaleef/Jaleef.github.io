/**
 * 发布流程（纯函数，不含 React 状态）
 * ----------------------------------
 * 把「一次发布」涉及的仓库操作全部收拢在这里，UI 只负责展示结果。
 *
 * 关键点：GitHub Contents API 在**更新已存在的文件时必须带上该文件的 sha**，
 * 否则会返回 422。早期版本重复发布同一标题时必然失败，就是漏了这一步。
 */

import { deletePost, getFileSha, listPostSlugs, putPost } from "../../lib/github";
import { uniqueSlug } from "../../lib/slug";
import { buildMarkdown, type PostPayload } from "./frontMatter";

export type PublishRequest = PostPayload & {
  /** 编辑中的原文件名；新建为空字符串 */
  originalSlug: string;
  /** 用户偏好 / 由标题推导出的文件名 */
  preferredSlug: string;
  /** 界面预览用、已去重的文件名 */
  previewSlug: string;
  /** 构建产物里已占用的文件名 */
  localSlugs: ReadonlySet<string>;
};

export type PublishResult =
  /** 已写入仓库；note 用于补充「旧文件是否清理成功」之类的说明 */
  | { type: "published"; slug: string; mode: "created" | "updated" | "renamed"; note?: string }
  /** 目标文件名已被占用，交给作者决定覆盖还是另存 */
  | { type: "conflict"; slug: string; sha: string; alternative: string }
  /** 编辑中的文件在仓库里已不存在 */
  | { type: "missing"; slug: string }
  /** 备选文件名也被占用了 */
  | { type: "taken"; slug: string };

/** 进度回调：写仓库期间给界面一句说明。 */
type ReportProgress = (message: string) => void;

/** 是否是「原地更新」——编辑已发布文章且文件名没改。 */
export function isInPlaceUpdate(request: PublishRequest): boolean {
  return Boolean(request.originalSlug) && request.previewSlug === request.originalSlug;
}

/** 新建或重新发布。文件名冲突时不会擅自覆盖，而是返回 `conflict` 让作者选择。 */
export async function publishPost(
  request: PublishRequest,
  token: string,
  report: ReportProgress,
): Promise<PublishResult> {
  const markdown = buildMarkdown(request);
  const title = request.title.trim();

  // 编辑已发布文章且文件名没变：直接覆盖原文件，时间戳刷新为今天
  if (isInPlaceUpdate(request)) {
    const sha = await getFileSha(request.originalSlug, token);
    if (!sha) return { type: "missing", slug: request.originalSlug };
    report("正在重新发布……");
    await putPost({
      slug: request.originalSlug,
      markdown,
      token,
      sha,
      message: `update: ${title}`,
    });
    return { type: "published", slug: request.originalSlug, mode: "updated" };
  }

  // 合并「本地构建产物」与「仓库里已有但尚未构建」的文件，避免悄悄覆盖旧文章
  const repoSlugs = await listPostSlugs(token);
  const occupied = new Set<string>([...request.localSlugs, ...repoSlugs]);
  // 编辑模式下自己不算占用，否则改名时会把自己的旧文件当成冲突
  if (request.originalSlug) occupied.delete(request.originalSlug);

  const chosen = request.preferredSlug || `post-${Date.now()}`;
  const existing = await getFileSha(chosen, token);
  if (existing) {
    return {
      type: "conflict",
      slug: chosen,
      sha: existing,
      alternative: uniqueSlug(chosen, occupied),
    };
  }

  const safeSlug = occupied.has(chosen) ? uniqueSlug(chosen, occupied) : chosen;
  // 换了名字时要重新确认一次：那份文件可能也存在（例如同一批里刚被占用）
  const recheck = safeSlug === chosen ? null : await getFileSha(safeSlug, token);
  report("正在发布……");
  await putPost({
    slug: safeSlug,
    markdown,
    token,
    sha: recheck ?? undefined,
    message: `${recheck ? "update" : "post"}: ${title}`,
  });

  // 改了标题 / 文件名时，把旧文件一并移除，避免留下重复文章
  let note: string | undefined;
  if (request.originalSlug && request.originalSlug !== safeSlug) {
    note = await removeRenamedOriginal(request.originalSlug, token);
  }

  return {
    type: "published",
    slug: safeSlug,
    mode: request.originalSlug ? "renamed" : "created",
    note,
  };
}

/** 冲突方案一：带上已有文件的 sha 覆盖原文。 */
export async function overwritePost(
  request: PublishRequest,
  target: { slug: string },
  token: string,
): Promise<PublishResult> {
  // 重新取一次 sha：从发现冲突到用户点击之间，文件可能已被别处改动
  const sha = await getFileSha(target.slug, token);
  if (!sha) return { type: "missing", slug: target.slug };
  await putPost({
    slug: target.slug,
    markdown: buildMarkdown(request),
    token,
    sha,
    message: `update: ${request.title.trim()}`,
  });
  return { type: "published", slug: target.slug, mode: "updated" };
}

/** 冲突方案二：用不冲突的新文件名发布，保留原文。 */
export async function saveAsNewPost(
  request: PublishRequest,
  slug: string,
  token: string,
): Promise<PublishResult> {
  const existing = await getFileSha(slug, token);
  if (existing) return { type: "taken", slug };
  await putPost({
    slug,
    markdown: buildMarkdown(request),
    token,
    message: `post: ${request.title.trim()}`,
  });
  return { type: "published", slug, mode: "renamed" };
}

/** 改名发布后清理旧文件；失败不影响发布结果，只在提示里说明。 */
async function removeRenamedOriginal(
  slug: string,
  token: string,
): Promise<string> {
  try {
    await deletePost({
      slug,
      token,
      message: `chore: 重命名前移除旧文件 ${slug}.md`,
    });
    return `旧的 ${slug}.md 已移除。`;
  } catch {
    return `注意：旧的 ${slug}.md 删除失败，请手动处理。`;
  }
}
