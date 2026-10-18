import { useEffect, useRef, useState } from "react";
import type { PostDraft } from "./usePostDraft";
import {
  isInPlaceUpdate,
  overwritePost,
  publishPost,
  saveAsNewPost,
  type PublishRequest,
  type PublishResult,
} from "./publishPost";

/** 文件名冲突时等待作者决定的方案。 */
export type Conflict = { slug: string; sha: string; alternative: string };

type PublishOptions = {
  /** 发布成功后回调（用于清除本机草稿、推进「已保存」基线） */
  onPublished?: () => void;
};

/**
 * 发布相关的状态机：Token、进度提示、文件名冲突。
 *
 * 表单内容不在这里维护（见 usePostDraft），这个 hook 只关心「怎么把内容写进仓库」，
 * 以及过程中要给用户看什么。
 */
export function usePublish(draft: PostDraft, options: PublishOptions = {}) {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);

  // 回调通过 ref 取最新值，避免发布过程中闭包拿到旧的表单状态
  const onPublishedRef = useRef(options.onPublished);
  useEffect(() => {
    onPublishedRef.current = options.onPublished;
  });

  const request: PublishRequest = {
    ...draft.payload,
    originalSlug: draft.originalSlug,
    preferredSlug: draft.preferredSlug,
    previewSlug: draft.resolvedSlug,
    localSlugs: draft.localSlugs,
  };

  const applyResult = (
    result: PublishResult,
    missingMessage: (slug: string) => string,
  ) => {
    switch (result.type) {
      case "published":
        setConflict(null);
        setToken("");
        setStatus(successMessage(result));
        onPublishedRef.current?.();
        return;
      case "conflict":
        // 冲突不是错误：清掉提示，展示选择框
        setStatus("");
        setConflict(result);
        return;
      case "missing":
        setConflict(null);
        setStatus(missingMessage(result.slug));
        return;
      case "taken":
        setStatus(
          `备用名 ${result.slug}.md 也已被占用，请修改标题或手动指定 slug。`,
        );
        return;
    }
  };

  const run = async (
    task: () => Promise<PublishResult>,
    options: { pending: string; missing: (slug: string) => string },
  ) => {
    setBusy(true);
    setStatus(options.pending);
    try {
      applyResult(await task(), options.missing);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "发布失败，请稍后重试。",
      );
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!request.title.trim() || !request.body.trim() || !token.trim()) {
      setStatus("请填写标题、正文和 GitHub Token。");
      return;
    }
    setConflict(null);
    await run(() => publishPost(request, token.trim(), setStatus), {
      pending: isInPlaceUpdate(request) ? "正在重新发布……" : "正在检查文件名……",
      missing: (slug) => `仓库中已找不到 ${slug}.md，可能已被删除。`,
    });
  };

  const overwrite = async (plan: Conflict) => {
    await run(() => overwritePost(request, plan, token.trim()), {
      pending: "正在更新原文……",
      missing: () => "该文件已不存在，请重新点击「发布文章」。",
    });
  };

  const saveAsNew = async (alternative: string) => {
    await run(() => saveAsNewPost(request, alternative, token.trim()), {
      pending: "正在另存为新文章……",
      missing: () => "该文件已不存在，请重新点击「发布文章」。",
    });
  };

  return {
    token,
    setToken,
    clearToken: () => setToken(""),
    status,
    busy,
    conflict,
    publish,
    overwrite,
    saveAsNew,
    dismissConflict: () => setConflict(null),
  };
}

/** 成功提示：说清写到了哪个文件、Pages 大概什么时候可见。 */
function successMessage(
  result: Extract<PublishResult, { type: "published" }>,
): string {
  const note = result.note ? ` ${result.note}` : "";
  if (result.mode === "created") {
    return `发布成功：content/posts/${result.slug}.md。GitHub Pages 正在部署，约一分钟后可访问。${note}`;
  }
  if (result.mode === "updated") {
    return `已重新发布 ${result.slug}.md，日期已更新为今天。GitHub Pages 正在重新部署，约一分钟后刷新可见。${note}`;
  }
  return `已发布为新文件 ${result.slug}.md，日期已更新为今天。${note}`;
}
