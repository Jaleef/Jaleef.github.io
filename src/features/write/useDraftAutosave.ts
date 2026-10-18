import { useEffect, useRef, useState } from "react";
import {
  clearDraft,
  isSameDraft,
  writeDraft,
  type DraftContent,
} from "./draftStorage";

/** 停止输入多久后落盘。太短会频繁写 localStorage，太长又容易丢内容。 */
const saveDelay = 600;

type DraftAutosaveOptions = {
  /** 草稿身份：新建文章与每篇既有文章各自独立 */
  scope: string;
  /** 当前表单内容 */
  snapshot: DraftContent;
};

/**
 * 草稿自动保存。
 *
 * - 以挂载时的内容为基线，只有真正改过才写盘（打开页面不会凭空产生草稿）；
 * - 发布成功后调用 `markSaved()`：清掉本地草稿并把基线推进到当前内容，
 *   这样刷新或关标签页时不会再提示「有未保存的修改」。
 */
export function useDraftAutosave({ scope, snapshot }: DraftAutosaveOptions) {
  const [baseline, setBaseline] = useState(() => JSON.stringify(snapshot));
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // snapshot 每次渲染都是新对象，用 ref 取最新值，避免 effect 被对象身份反复触发
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  });

  const serialized = JSON.stringify(snapshot);
  const dirty = serialized !== baseline;

  useEffect(() => {
    if (serialized === baseline) return;
    const timer = window.setTimeout(() => {
      const current = snapshotRef.current;
      const savedAt = Date.now();
      if (writeDraft(scope, { ...current, savedAt })) setSavedAt(savedAt);
    }, saveDelay);
    return () => window.clearTimeout(timer);
  }, [scope, serialized, baseline]);

  const markSaved = () => {
    setBaseline(JSON.stringify(snapshotRef.current));
    setSavedAt(null);
    clearDraft(scope);
  };

  return {
    /** 有未保存到仓库的改动（用于离开页面提醒） */
    dirty,
    /** 最近一次自动保存的时间戳 */
    savedAt,
    /** 发布成功后调用 */
    markSaved,
    /** 判断某份草稿与当前内容是否一致 */
    matchesCurrent: (draft: DraftContent) =>
      isSameDraft(draft, snapshotRef.current),
  };
}
