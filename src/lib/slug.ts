/**
 * 文章文件名（slug）工具
 * ----------------------
 * 早期版本用 `replace(/[^\w\s-]/g, '')` 推导文件名，而 `\w` 只匹配 ASCII，
 * 中文标题会被整段删掉，得到 `-` 甚至空字符串，于是文件名变成 `-.md`。
 *
 * 这里改用 Unicode 感知的规则：
 *   - 保留各国文字与数字（`\p{L}` / `\p{N}`），中文标题也能得到可读的 slug；
 *   - 空格与各类标点统一折叠成单个连字符；
 *   - 只保留安全的文件名字符，避免路径穿越与非法字符。
 */

/** 把标题转换成安全的文件名片段；无法得到有效字符时返回空字符串。 */
export function createSlug(title: string): string {
  return (
    title
      .normalize("NFKC")
      .toLowerCase()
      .trim()
      // 保留所有语言的字母、数字，以及空格、连字符、下划线
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      // 空白与下划线折叠成连字符
      .replace(/[\s_]+/g, "-")
      // 连续连字符合并成一个，避免出现 `a--b` 这类难看的文件名
      .replace(/-{2,}/g, "-")
      // 去掉首尾多余连字符
      .replace(/^-+|-+$/g, "")
  );
}

/**
 * 得到唯一的 slug。若候选名已被占用，则追加 `-2`、`-3`……
 * 全部候选都不可用时退回时间戳，保证一定得到合法文件名。
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const fallback = base || `post-${Date.now()}`;
  if (!used.has(fallback)) return fallback;
  for (let index = 2; index < 500; index += 1) {
    const candidate = `${fallback}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${fallback}-${Date.now()}`;
}
