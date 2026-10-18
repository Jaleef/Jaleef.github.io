/**
 * 路由参数处理
 */

/**
 * 取路由里的 slug 参数。
 * react-router 会先解码一次，这里再解一次作为兜底：已解码的普通字符串不会包含 `%`，
 * 重复解码结果不变；若字符串里本来就有 `%`，解码会抛错，此时原样返回。
 */
export function decodeSlugParam(param: string | undefined): string {
  if (!param) return "";
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}
