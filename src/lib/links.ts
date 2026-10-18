/**
 * 站内链接
 * --------
 * slug 可能是中文，必须经过 encodeURIComponent 才能安全放进 hash 路由。
 * 集中在这里生成，避免某处漏掉编码导致中文文章点不开。
 */

/** 文章详情页 */
export function postLink(slug: string): string {
  return `/post/${encodeURIComponent(slug)}`;
}

/** 文章编辑页 */
export function editLink(slug: string): string {
  return `/write/${encodeURIComponent(slug)}`;
}
