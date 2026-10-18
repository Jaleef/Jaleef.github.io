/**
 * 文章 Markdown 的解析工具
 * ------------------------
 * 首页、详情页与编辑器共用同一套解析规则，避免各处各自实现 Front Matter 解析而产生分歧。
 *
 * 文章被拆成两份数据：
 *   - `PostSummary`：列表页需要的元信息，构建期内联进首屏（见 vite/postsIndexPlugin.ts）；
 *   - `Post`：额外包含正文，按需动态加载（见 features/posts/posts.ts）。
 * 这样首页不必为所有文章的正文买单。
 */

/** 列表页需要的元信息。 */
export type PostSummary = {
  slug: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
};

/** 带正文的完整文章。 */
export type Post = PostSummary & {
  body: string;
  /** 原始 Markdown（含 Front Matter），编辑时用它回填编辑器 */
  source: string;
};

/**
 * 读取 Front Matter 里的某个字段。
 *
 * 注意这里只能用 `[ \t]*`，不能用 `\s*`：写作页总会写出 `description: `（值为空）这样的行，
 * 而 `\s` 包含换行，会越过行尾把下一行（`date: 2026-10-18`）当成摘要读出来。
 */
function readFrontMatter(metadata: string, key: string): string {
  return (
    metadata.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"))?.[1]?.trim() ?? ""
  );
}

/** 解析一篇 Markdown 文章。 */
export function parsePost(source: string, slug: string): Post {
  const match = source.match(/^---\s*([\s\S]*?)\s*---\s*([\s\S]*)$/);
  const metadata = match?.[1] ?? "";
  const body = match?.[2]?.trim() ?? source.trim();
  const tags = readFrontMatter(metadata, "tags")
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    slug,
    title: readFrontMatter(metadata, "title") || slug,
    description: readFrontMatter(metadata, "description"),
    date: readFrontMatter(metadata, "date") || "未设置日期",
    tags,
    body,
    source,
  };
}

/** 从完整文章里取出列表页需要的那部分。 */
export function toSummary(post: Post): PostSummary {
  const { slug, title, description, date, tags } = post;
  return { slug, title, description, date, tags };
}

/** 从路径中取出 slug，例如 `../content/posts/foo.md` -> `foo`。 */
export function slugFromPath(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/, "") ?? "";
}

/** 按日期倒序排列（未设置日期的排在最后）。 */
export function sortByDateDescending<T extends { date: string }>(
  list: T[],
): T[] {
  return [...list].sort((a, b) => b.date.localeCompare(a.date));
}
