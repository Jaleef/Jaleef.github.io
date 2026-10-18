import { useMemo, useState } from "react";
import type { Post } from "../../lib/post";
import { createSlug, uniqueSlug } from "../../lib/slug";
import { localSlugs } from "../posts/posts";
import type { DraftContent, DraftSnapshot } from "./draftStorage";
import type { PostPayload } from "./frontMatter";

const starterBody =
  "# 开始写作\n\n在这里写下你的文章内容……\n\n数学公式用 LaTeX 语法：行内写作 $E = mc^2$，独立成行用两个美元符号包裹。\n";

/**
 * 写作页的表单状态与文件名推导。
 *
 * 文件名（slug）的优先级：用户手填 > 编辑时继承的原文件名 > 由标题推导。
 * 单独用一个「是否手动改过」的标记来区分「继承来的值」与「用户改过的值」，
 * 否则改标题时会永远沿用旧文件名，标题与 URL 会脱节。
 */
export function usePostDraft(editingPost: Post | null) {
  const [title, setTitle] = useState(editingPost?.title ?? "");
  // slug 输入框刻意留空：空值表示「沿用原标题推导出的文件名」，编辑模式下则沿用原文件名
  const [slugInput, setSlugInput] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState(editingPost?.description ?? "");
  const [tags, setTags] = useState(editingPost?.tags.join(", ") ?? "");
  const [body, setBody] = useState(editingPost?.body ?? starterBody);

  /** 正在编辑的文章原始 slug；空字符串表示新建。 */
  const originalSlug = editingPost?.slug ?? "";
  /** 每次发布都用当天日期，因此「修改重发」会把时间戳刷新为最新。 */
  const date = new Date().toISOString().slice(0, 10);

  const preferredSlug = useMemo(
    () =>
      createSlug(slugInput) ||
      (slugEdited ? "" : originalSlug) ||
      createSlug(title),
    [slugInput, slugEdited, originalSlug, title],
  );

  // 预览用：偏好名若与已有文章冲突，自动换成不冲突的名字。
  // 编辑模式下当前文章自己不算冲突，否则改标题时会被误判成重名。
  const resolvedSlug = useMemo(() => {
    const others = new Set(localSlugs);
    if (originalSlug) others.delete(originalSlug);
    return uniqueSlug(preferredSlug, others);
  }, [preferredSlug, originalSlug]);

  /** 标题或手动 slug 被改动，会导致文件名变化。 */
  const slugChanged = Boolean(originalSlug) && resolvedSlug !== originalSlug;

  const updateSlug = (value: string) => {
    setSlugInput(value);
    setSlugEdited(true);
  };

  /** 用本机草稿覆盖当前表单。 */
  const restore = (draft: DraftSnapshot) => {
    setTitle(draft.title);
    setSlugInput(draft.slugInput);
    setSlugEdited(draft.slugEdited);
    setDescription(draft.description);
    setTags(draft.tags);
    setBody(draft.body);
  };

  const payload: PostPayload = { title, description, tags, body, date };
  /** 需要落盘 / 比较的表单内容（与 payload 的区别：含 slug 输入框状态，不含 date） */
  const snapshot: DraftContent = {
    title,
    slugInput,
    slugEdited,
    description,
    tags,
    body,
  };

  return {
    title,
    setTitle,
    slugInput,
    updateSlug,
    description,
    setDescription,
    tags,
    setTags,
    body,
    setBody,
    originalSlug,
    date,
    preferredSlug,
    resolvedSlug,
    slugChanged,
    localSlugs,
    payload,
    snapshot,
    restore,
  };
}

export type PostDraft = ReturnType<typeof usePostDraft>;
