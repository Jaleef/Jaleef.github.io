import { postPath } from "../../lib/config";
import type { Conflict } from "./usePublish";

type ConflictPromptProps = {
  conflict: Conflict;
  busy: boolean;
  onOverwrite: () => void;
  onSaveAsNew: () => void;
  onCancel: () => void;
};

/**
 * 文件名冲突时的选择框。
 * 给出两个明确的选择，而不是把 422 直接抛给作者。
 */
export function ConflictPrompt({
  conflict,
  busy,
  onOverwrite,
  onSaveAsNew,
  onCancel,
}: ConflictPromptProps) {
  return (
    <div className="conflict-box">
      <p className="conflict-title">
        仓库中已存在 <code>{postPath(conflict.slug)}</code>，你想怎么处理？
      </p>
      <div className="conflict-actions">
        <button
          className="primary-button"
          onClick={onOverwrite}
          disabled={busy}
        >
          更新原文
        </button>
        {conflict.alternative && (
          <button
            className="secondary-button conflict-new"
            onClick={onSaveAsNew}
            disabled={busy}
          >
            另存为新文章（{conflict.alternative}.md）
          </button>
        )}
        <button className="secondary-button" onClick={onCancel} disabled={busy}>
          取消
        </button>
      </div>
      <p className="conflict-hint">
        「更新原文」会覆盖仓库中的同名文件；「另存为新文章」会保留原文，用新的文件名发布。
      </p>
    </div>
  );
}
