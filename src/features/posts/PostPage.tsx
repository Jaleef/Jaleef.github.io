import { Link, useParams } from "react-router-dom";
import { BackLink } from "../../components/BackLink";
import { MarkdownBody } from "../../components/MarkdownBody";
import { TagList } from "../../components/TagList";
import { editLink } from "../../lib/links";
import { DeletePostPanel } from "./DeletePostPanel";
import { findSummaryBySlug } from "./posts";
import { useLoadedPost } from "./useLoadedPost";

/**
 * 文章详情页：元信息来自首屏包，正文按需加载。
 * 正文加载期间先把标题、日期、摘要渲染出来，避免整页空白。
 */
export function PostPage() {
  const { slug } = useParams();
  const summary = findSummaryBySlug(slug);
  const { post, failed } = useLoadedPost(summary?.slug);

  if (!summary)
    return (
      <div className="not-found">
        <h1>找不到这篇文章</h1>
        <Link to="/">返回文章列表</Link>
      </div>
    );

  return (
    <article className="post-page">
      <div className="post-page-nav">
        <BackLink to="/">← 返回文章列表</BackLink>
        <Link className="edit-link" to={editLink(summary.slug)}>
          编辑并重新发布
        </Link>
      </div>
      <p className="eyebrow">{summary.date}</p>
      <h1>{summary.title}</h1>
      <p className="post-description">{summary.description}</p>
      <TagList tags={summary.tags} />
      {post ? (
        <MarkdownBody source={post.body} />
      ) : (
        <p className="post-loading">
          {failed ? "正文加载失败，请刷新页面重试。" : "正在加载正文……"}
        </p>
      )}
      {/* key 让切到另一篇文章时自动清空 token 与状态 */}
      <DeletePostPanel key={summary.slug} post={summary} />
    </article>
  );
}
