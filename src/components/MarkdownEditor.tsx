import { useDeferredValue, useEffect, useMemo, useRef } from "react";
import { renderMarkdown } from "../lib/markdown";

/**
 * 分栏 Markdown 编辑器：左侧写源文件，右侧实时预览。
 *
 * 预览刻意复用与文章页完全相同的渲染管线（见 renderMarkdown），
 * 因此「编辑时看到的」与「发布后读者看到的」保持一致，包括数学公式。
 */

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export function MarkdownEditor({
  value,
  onChange,
  className,
}: MarkdownEditorProps) {
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  // 输入时先更新文本域，预览用延迟值渲染，避免长文输入卡顿
  const deferredValue = useDeferredValue(value);
  const html = useMemo(() => renderMarkdown(deferredValue), [deferredValue]);

  // Tab 插入两个空格，而不是把焦点移走（写代码块/缩进时必需）
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    const target = event.currentTarget;
    const { selectionStart, selectionEnd } = target;
    const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
    onChange(next);
    window.requestAnimationFrame(() => {
      target.selectionStart = selectionStart + 2;
      target.selectionEnd = selectionStart + 2;
    });
  };

  // 滚动同步：按比例跟随，长文时右侧不会跑偏
  useEffect(() => {
    const source = sourceRef.current;
    const preview = previewRef.current;
    if (!source || !preview) return;

    const sync = () => {
      const sourceRange = source.scrollHeight - source.clientHeight;
      const previewRange = preview.scrollHeight - preview.clientHeight;
      if (sourceRange <= 0 || previewRange <= 0) return;
      preview.scrollTop = (source.scrollTop / sourceRange) * previewRange;
    };
    source.addEventListener("scroll", sync, { passive: true });
    return () => source.removeEventListener("scroll", sync);
  }, []);

  return (
    <div className={`md-editor ${className ?? ""}`}>
      <div className="md-editor__pane">
        <div className="md-editor__label">Markdown 源文件</div>
        <textarea
          ref={sourceRef}
          className="md-editor__source"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          aria-label="Markdown 源文件"
          placeholder={
            "# 开始写作\n\n支持 Markdown 语法；数学公式用 $...$ 行内、$$...$$ 独立成行。"
          }
        />
      </div>
      <div className="md-editor__pane">
        <div className="md-editor__label">预览（与发布后效果一致）</div>
        <div
          ref={previewRef}
          className="md-editor__preview markdown-body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
