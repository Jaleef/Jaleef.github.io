import { Link } from "react-router-dom";
import { TagList } from "../../components/TagList";
import { editLink, postLink } from "../../lib/links";
import type { PostSummary } from "../../lib/post";

/** 首页的文章卡片：整块可点击，右下角单独给出编辑入口。 */
export function PostCard({ post }: { post: PostSummary }) {
  return (
    <div className="post-card-row">
      <Link className="post-card" to={postLink(post.slug)}>
        <div className="post-date">{post.date}</div>
        <div>
          <h3>{post.title}</h3>
          <p>{post.description || "点击阅读这篇文章。"}</p>
          <TagList tags={post.tags} />
        </div>
        <span className="arrow">↗</span>
      </Link>
      <Link
        className="edit-link"
        to={editLink(post.slug)}
        title="编辑并重新发布这篇文章"
      >
        编辑
      </Link>
    </div>
  );
}
