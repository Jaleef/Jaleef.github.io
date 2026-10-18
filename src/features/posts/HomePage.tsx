import { PostCard } from "./PostCard";
import { postSummaries } from "./posts";

/** 首页：一段自我介绍 + 最新文章列表（只需要元信息，不加载正文）。 */
export function HomePage() {
  return (
    <section className="home-page">
      <div className="intro">
        <p className="eyebrow">PERSONAL BLOG</p>
        <h1>
          记录代码，也记录
          <br />
          <em>一路上的思考。</em>
        </h1>
        <p className="intro-copy">
          这里是我的写作空间，分享AI Agent开发、技术实践，以及那些值得留下来的想法。
        </p>
      </div>
      <div className="section-heading">
        <h2>最新文章</h2>
        <span>{postSummaries.length} 篇文章</span>
      </div>
      <div className="post-list">
        {postSummaries.length === 0 && (
          <p className="empty">还没有文章，去写下第一篇吧。</p>
        )}
        {postSummaries.map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </div>
    </section>
  );
}
