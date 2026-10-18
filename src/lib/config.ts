/**
 * 仓库与路径配置
 * --------------
 * 站点是纯静态的：文章由 GitHub Actions 在构建时读入，
 * 写作页则通过 GitHub Contents API 把文章直接提交回仓库。
 * 这两处必须指向同一个仓库，所以集中在这里配置。
 */

export const repository = {
  owner: "Jaleef",
  name: "Jaleef.github.io",
  /** 文章所在的仓库目录，与构建时读取的目录保持一致 */
  postsDirectory: "content/posts",
} as const;

/** 文章在仓库中的相对路径，例如 `content/posts/welcome.md`。 */
export function postPath(slug: string): string {
  return `${repository.postsDirectory}/${slug}.md`;
}
