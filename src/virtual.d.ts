/**
 * 构建期生成的虚拟模块声明（实现见 vite/postsIndexPlugin.ts）。
 */
declare module "virtual:posts-index" {
  import type { PostSummary } from "./lib/post.ts";

  const posts: PostSummary[];
  export default posts;
}
