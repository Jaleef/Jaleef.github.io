import { createSlug } from "../../lib/slug";
import type { PostDraft } from "./usePostDraft";

/** 标题与元信息表单，外加「将发布为哪个文件」的预览。 */
export function PostMetaFields({ draft }: { draft: PostDraft }) {
  // 自定义 slug 里的空格 / 标点会被折叠成连字符，这里提示一下，避免作者以为名字没生效
  const slugRewritten = createSlug(draft.slugInput) !== draft.slugInput.trim();

  return (
    <>
      <input
        className="title-input"
        value={draft.title}
        onChange={(event) => draft.setTitle(event.target.value)}
        placeholder="文章标题"
      />
      <div className="post-options">
        <input
          value={draft.slugInput}
          onChange={(event) => draft.updateSlug(event.target.value)}
          placeholder="URL slug（留空则按标题自动生成）"
        />
        <input
          value={draft.description}
          onChange={(event) => draft.setDescription(event.target.value)}
          placeholder="文章摘要（可选）"
        />
        <input
          value={draft.tags}
          onChange={(event) => draft.setTags(event.target.value)}
          placeholder="标签，用逗号分隔"
        />
      </div>
      {/* 发布前的文件名预览，避免到报错才发现 slug 不对 */}
      {draft.title.trim() && (
        <p className="slug-preview">
          将发布为 <code>{draft.resolvedSlug}.md</code>
          {draft.slugInput.trim() ? (
            slugRewritten ? (
              <span className="slug-warning">
                （自定义 slug 中的空格与特殊字符已替换为连字符）
              </span>
            ) : null
          ) : (
            <span className="slug-warning">
              {draft.originalSlug
                ? "（沿用现有文件名，清空标题或修改 slug 可改名）"
                : "（由标题自动生成）"}
            </span>
          )}
        </p>
      )}
    </>
  );
}
