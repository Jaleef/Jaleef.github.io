import { BackLink } from "../../components/BackLink";

type WriteToolbarProps = {
  backTo: string;
  token: string;
  publishLabel: string;
  busy: boolean;
  onTokenChange: (token: string) => void;
  onClearToken: () => void;
  onPublish: () => void;
};

/**
 * 写作页顶部工具栏。
 * Token 输入框与发布按钮放在同一行：点完发布立刻能看到结果，不必滚到底部检查。
 */
export function WriteToolbar({
  backTo,
  token,
  publishLabel,
  busy,
  onTokenChange,
  onClearToken,
  onPublish,
}: WriteToolbarProps) {
  return (
    <div className="write-toolbar">
      <BackLink to={backTo}>← 返回</BackLink>
      <div className="write-actions">
        <input
          className="token-input"
          type="password"
          value={token}
          onChange={(event) => onTokenChange(event.target.value)}
          placeholder="GitHub Token（Contents: Read and write）"
          aria-label="GitHub Fine-grained Token"
        />
        <button className="secondary-button" onClick={onClearToken}>
          清除 Token
        </button>
        <button className="primary-button" onClick={onPublish} disabled={busy}>
          {publishLabel}
        </button>
      </div>
    </div>
  );
}
