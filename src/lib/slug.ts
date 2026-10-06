/**
 * 文章文件名（slug）与仓库路径的工具
 * ------------------------------------
 * 之前的问题是：slug 用 `replace(/[^\w\s-]/g, '')` 推导，而 `\w` 只匹配
 * ASCII 字母数字下划线 —— 中文标题会被整段删掉，得到 `-` 甚至空字符串，
 * 于是文件名变成 `-.md`、URL 变成 `#/post/-`。
 *
 * 这里改用 Unicode 感知的规则：
 *   - 保留各国文字与数字（`\p{L}` / `\p{N}`），中文标题也能得到可读的 slug；
 *   - 空格与各类标点统一折叠成单个连字符；
 *   - 只保留安全的文件名字符，避免路径穿越与非法字符。
 */

/** 把标题转换成安全的文件名片段；无法得到有效字符时返回空字符串。 */
export function createSlug(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    // 保留所有语言的字母、数字，以及空格、连字符、下划线
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    // 空白与下划线折叠成连字符
    .replace(/[\s_]+/g, '-')
    // 去掉首尾多余连字符
    .replace(/^-+|-+$/g, '')
}

/**
 * 得到唯一的 slug。若候选名已被占用，则追加 `-2`、`-3`……
 * 全部候选都不可用时退回时间戳，保证一定得到合法文件名。
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const fallback = base || `post-${Date.now()}`
  if (!used.has(fallback)) return fallback
  for (let index = 2; index < 500; index += 1) {
    const candidate = `${fallback}-${index}`
    if (!used.has(candidate)) return candidate
  }
  return `${fallback}-${Date.now()}`
}

/** 文章在仓库中的路径。slug 可能是非 ASCII，交给 encodeURIComponent 处理。 */
export function postPath(slug: string): string {
  return `content/posts/${slug}.md`
}

/**
 * 查询仓库中某个 slug 是否已存在。
 * 返回 `{ sha }` 表示文件已存在（更新时必须带上它），`null` 表示是新文件，
 * `undefined` 表示无法确定（例如网络异常），交由后续写入请求报告错误。
 */
export async function fetchExistingSha(
  owner: string,
  repo: string,
  slug: string,
  token: string,
): Promise<{ sha: string } | null | undefined> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${postPath(slug)}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
    )
    if (response.status === 404) return null
    if (response.ok) {
      const data = await response.json() as { sha?: string }
      return data.sha ? { sha: data.sha } : undefined
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * 列出仓库中已有的文章文件名。
 * 用来发现「仓库里已存在、但当前构建产物还没有」的文件，
 * 避免生成的 slug 悄悄覆盖它们。令牌不可用时返回空数组。
 */
export async function fetchRepoSlugs(owner: string, repo: string, token: string): Promise<string[]> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/content/posts`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
    )
    if (!response.ok) return []
    const entries = await response.json() as { name?: string }[]
    if (!Array.isArray(entries)) return []
    return entries
      .map((entry) => entry.name ?? '')
      .filter((name) => name.toLowerCase().endsWith('.md'))
      .map((name) => name.slice(0, -3))
      .filter(Boolean)
  } catch {
    return []
  }
}

