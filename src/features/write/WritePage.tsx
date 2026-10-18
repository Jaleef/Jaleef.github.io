import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MarkdownEditor } from "../../components/MarkdownEditor";
import { useUnsavedChangesWarning } from "../../hooks/useUnsavedChangesWarning";
import { postLink } from "../../lib/links";
import type { Post } from "../../lib/post";
import { decodeSlugParam } from "../../lib/route";
import { findSummaryBySlug } from "../posts/posts";
import { useLoadedPost } from "../posts/useLoadedPost";
import { ConflictPrompt } from "./ConflictPrompt";
import { DraftRestorePrompt } from "./DraftRestorePrompt";
import { EditBanner } from "./EditBanner";
import {
  clearDraft,
  formatClock,
  readDraft,
  type DraftSnapshot,
} from "./draftStorage";
import { PostMetaFields } from "./PostMetaFields";
import { useDraftAutosave } from "./useDraftAutosave";
import { WriteToolbar } from "./WriteToolbar";
import { usePostDraft } from "./usePostDraft";
import { usePublish } from "./usePublish";

/**
 * 写作页：新建与编辑共用。
 * 表单状态在 usePostDraft，草稿暂存在 useDraftAutosave，仓库交互在 usePublish，
 * 这里只负责把它们拼成页面。
 */
export function WritePage({ editingPost }: { editingPost: Post | null }) {
  const draft = usePostDraft(editingPost);
  // 新建与每篇既有文章各有独立的草稿，互不覆盖
  const scope = editingPost ? `edit:${editingPost.slug}` : "new";
  const autosave = useDraftAutosave({ scope, snapshot: draft.snapshot });
  const publisher = usePublish(draft, { onPublished: autosave.markSaved });
  const conflict = publisher.conflict;

  // 打开页面时若本机还有未发布的草稿，先问是否恢复；与当前内容一致（陈旧）的直接清掉
  const [pendingDraft, setPendingDraft] = useState<DraftSnapshot | null>(() => {
    const stored = readDraft(scope);
    if (!stored) return null;
    if (autosave.matchesCurrent(stored)) {
      clearDraft(scope);
      return null;
    }
    return stored;
  });

  useUnsavedChangesWarning(autosave.dirty);

  return (
    <section className="write-page">
      <WriteToolbar
        backTo={draft.originalSlug ? postLink(draft.originalSlug) : "/"}
        token={publisher.token}
        publishLabel={draft.originalSlug ? "重新发布" : "发布文章"}
        busy={publisher.busy}
        onTokenChange={publisher.setToken}
        onClearToken={publisher.clearToken}
        onPublish={publisher.publish}
      />
      {pendingDraft && (
        <DraftRestorePrompt
          draft={pendingDraft}
          onRestore={() => {
            draft.restore(pendingDraft);
            setPendingDraft(null);
          }}
          onDiscard={() => {
            clearDraft(scope);
            setPendingDraft(null);
          }}
        />
      )}
      {draft.originalSlug && (
        <EditBanner
          originalSlug={draft.originalSlug}
          resolvedSlug={draft.resolvedSlug}
          slugChanged={draft.slugChanged}
          date={draft.date}
        />
      )}
      {/* 发布状态紧贴工具栏，出错时就在按钮正下方，一眼可见 */}
      {publisher.status && (
        <p className="status toolbar-status">{publisher.status}</p>
      )}
      {conflict && (
        <ConflictPrompt
          conflict={conflict}
          busy={publisher.busy}
          onOverwrite={() => publisher.overwrite(conflict)}
          onSaveAsNew={() => publisher.saveAsNew(conflict.alternative)}
          onCancel={publisher.dismissConflict}
        />
      )}
      <PostMetaFields draft={draft} />
      <MarkdownEditor value={draft.body} onChange={draft.setBody} />
      <p className="draft-hint">
        {autosave.savedAt
          ? `草稿已自动保存到本机浏览器 · ${formatClock(autosave.savedAt)}`
          : "编辑内容会自动暂存到本机浏览器（不上传），发布成功后清除。"}
      </p>
      <p className="token-hint">
        Token 仅用于本次发布，不会保存到任何地方；刷新页面后需要重新输入。
      </p>
    </section>
  );
}

/**
 * 写作页的路由包装。
 *
 * 1. 编辑模式需要正文，而正文是动态加载的，因此先在这里等待文章资源；
 * 2. 表单 state 只在挂载时回填，若路由参数变化而组件被复用，
 *    从「写新文章」切到「编辑某篇」时不会重新载入（hash 路由下是原地跳转，很常见），
 *    所以用 key 强制重挂载。
 */
export function WriteRoute() {
  const { slug } = useParams();
  const decoded = decodeSlugParam(slug);
  const summary = findSummaryBySlug(decoded);
  const { post, failed } = useLoadedPost(summary?.slug);

  // slug 不在构建产物里（例如手改了地址）：按「新建」处理
  if (!summary) return <WritePage key={decoded || "new"} editingPost={null} />;

  if (failed)
    return (
      <section className="write-page">
        <p className="status toolbar-status">正文加载失败，请刷新页面重试。</p>
        <Link className="back-link" to={postLink(summary.slug)}>
          ← 返回文章
        </Link>
      </section>
    );

  if (!post)
    return (
      <section className="write-page">
        <p className="post-loading">正在载入 {summary.slug}.md……</p>
      </section>
    );

  return <WritePage key={post.slug} editingPost={post} />;
}
