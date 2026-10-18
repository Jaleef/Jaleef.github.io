import { formatClock, type DraftSnapshot } from "./draftStorage";

type DraftRestorePromptProps = {
  draft: DraftSnapshot;
  onRestore: () => void;
  onDiscard: () => void;
};

/** 再次打开写作页时，发现本机有未发布的草稿，询问是否恢复。 */
export function DraftRestorePrompt({
  draft,
  onRestore,
  onDiscard,
}: DraftRestorePromptProps) {
  const savedAt = formatClock(draft.savedAt);
  return (
    <div className="draft-restore">
      <p>
        发现本机自动保存的草稿
        {savedAt && `（${savedAt} 保存）`}，要恢复吗？
      </p>
      <button className="secondary-button" onClick={onRestore}>
        恢复草稿
      </button>
      <button className="secondary-button" onClick={onDiscard}>
        丢弃
      </button>
    </div>
  );
}
