import { useEffect, useState } from "react";
import type { Post } from "../../lib/post";
import { loadPost } from "./posts";

type LoadedPost = {
  /** 加载完成前为 null */
  post: Post | null;
  failed: boolean;
};

type LoadState = {
  /** 这份状态属于哪个 slug */
  slug: string | undefined;
  post: Post | null;
  failed: boolean;
};

/**
 * 按需加载一篇文章的正文。
 * 正文不在首屏包里，所以详情页与编辑页都要经过这一步。
 *
 * 状态带上 slug：请求返回时若已切到别的文章，旧结果会被忽略（不会闪现上一篇的内容）。
 */
export function useLoadedPost(slug: string | undefined): LoadedPost {
  const [state, setState] = useState<LoadState>({
    slug: undefined,
    post: null,
    failed: false,
  });

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    loadPost(slug)
      .then((post) => {
        if (!cancelled) setState({ slug, post, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ slug, post: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // 状态与当前 slug 不匹配时视为「加载中」
  if (state.slug !== slug) return { post: null, failed: false };
  return { post: state.post, failed: state.failed };
}
