/**
 * 文章 Markdown 的解析工具
 * ------------------------
 * 从 App.tsx 抽出来，让「首页/详情页」和「编辑器」共用同一套解析规则，
 * 避免两处各自实现 Front Matter 解析而产生分歧。
 */

export type PostDraft = {
  title: string
  description: string
  tags: string[]
  body: string
}

export type Post = PostDraft & {
  slug: string
  date: string
  /** 原始 Markdown（含 Front Matter），编辑时用它回填编辑器 */
  source: string
}

function readFrontMatter(metadata: string, key: string): string {
  return metadata.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? ''
}

/** 解析一篇 Markdown 文章。 */
export function parsePost(source: string, slug: string): Post {
  const match = source.match(/^---\s*([\s\S]*?)\s*---\s*([\s\S]*)$/)
  const metadata = match?.[1] ?? ''
  const body = match?.[2]?.trim() ?? source.trim()
  const tags = readFrontMatter(metadata, 'tags')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)

  return {
    slug,
    title: readFrontMatter(metadata, 'title') || slug,
    description: readFrontMatter(metadata, 'description'),
    date: readFrontMatter(metadata, 'date') || '未设置日期',
    tags,
    body,
    source,
  }
}

/** 从路径中取出 slug，例如 `../content/posts/foo.md` -> `foo`。 */
export function slugFromPath(path: string): string {
  return path.split('/').pop()?.replace(/\.md$/, '') ?? ''
}

/** 按日期倒序排列（未设置日期的排在最后）。 */
export function sortPostsByDate(list: Post[]): Post[] {
  return [...list].sort((a, b) => b.date.localeCompare(a.date))
}
