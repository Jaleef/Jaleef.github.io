import summaries from "virtual:posts-index";
import {
  parsePost,
  slugFromPath,
  sortByDateDescending,
  type Post,
  type PostSummary,
} from "../../lib/post";
import { decodeSlugParam } from "../../lib/route";

/**
 * 文章数据入口
 * ------------
 * - 元信息来自构建期生成的虚拟模块（virtual:posts-index），随首屏一起下发，只有几 KB；
 * - 正文用 `import.meta.glob` 按需动态导入，打开哪篇才加载哪篇的 Markdown。
 *
 * 因此新发布的文章必须等 GitHub Pages 重新构建后才会出现在列表里。
 */

const rawLoaders = import.meta.glob("../../../content/posts/*.md", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

const loaderBySlug = new Map(
  Object.entries(rawLoaders).map(([path, load]) => [slugFromPath(path), load]),
);

/** 全部文章元信息，按日期倒序。 */
export const postSummaries: PostSummary[] = sortByDateDescending(summaries);

/** 构建产物里已占用的文件名，发布时用来避免重名。 */
export const localSlugs: ReadonlySet<string> = new Set(
  postSummaries.map((post) => post.slug),
);

/** 按 slug 查元信息；找不到返回 null。 */
export function findSummaryBySlug(
  slug: string | undefined,
): PostSummary | null {
  const decoded = decodeSlugParam(slug);
  if (!decoded) return null;
  return postSummaries.find((post) => post.slug === decoded) ?? null;
}

/** 按需加载一篇完整文章（含正文）。 */
export async function loadPost(slug: string): Promise<Post> {
  const load = loaderBySlug.get(slug);
  if (!load) throw new Error(`找不到文章：${slug}`);
  return parsePost(await load(), slug);
}
