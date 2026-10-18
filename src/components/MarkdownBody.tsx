import { useMemo } from "react";
import { renderMarkdown } from "../lib/markdown";

/**
 * 渲染后的 Markdown 正文。
 * 与编辑器预览调用同一个 renderMarkdown，保证读者看到的就是作者预览到的。
 */
export function MarkdownBody({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const html = useMemo(() => renderMarkdown(source), [source]);
  return (
    <div
      className={className ? `markdown-body ${className}` : "markdown-body"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
