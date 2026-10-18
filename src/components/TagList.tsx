/** 文章标签列表。没有标签时只渲染空容器，保持列表项间距一致。 */
export function TagList({ tags }: { tags: string[] }) {
  return (
    <div className="tags">
      {tags.map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
    </div>
  );
}
