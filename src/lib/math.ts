/**
 * KaTeX 渲染
 * ----------
 * 只负责「LaTeX 字符串 → HTML」，不关心 Markdown 怎么切分公式，
 * 那部分在 markdown.ts。文章页与编辑器预览共用这里的配置，
 * 保证「编辑时看到的」与「发布后读者看到的」一致。
 *
 * KaTeX 的样式与字体在这里一并导入：它们只在有公式的页面才需要，
 * 因此会随文章页 / 写作页的异步包一起加载，不占用首页首屏。
 */

import "katex/dist/katex.min.css";
import DOMPurify from "dompurify";
import katex from "katex";

export const katexOptions: katex.KatexOptions = {
  throwOnError: false, // 语法错误时就地显示原文，而不是抛出异常导致整页白屏
  strict: false, // 放宽非标准命令的告警，避免控制台噪音
  output: "htmlAndMathml", // 同时输出 MathML，便于无障碍读取与跨浏览器回退
};

/** 同一段公式在一次会话里会被反复渲染（预览会重渲染整篇），缓存起来省掉重复排版。 */
const cache = new Map<string, string>();
const cacheLimit = 500;

/** 把一段 LaTeX 渲染成 HTML，失败时降级为原文展示。 */
export function renderMath(latex: string, displayMode: boolean): string {
  const source = latex.trim();
  if (!source) return "";
  const cacheKey = `${displayMode ? "block" : "inline"}:${source}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  let html: string;
  try {
    html = katex.renderToString(source, { ...katexOptions, displayMode });
  } catch {
    html = `<code>${escapeHtml(source)}</code>`;
  }

  // KaTeX 的 HTML 是可信产物，但它会被 dangerouslySetInnerHTML 注入，
  // 所以仍然单独过一遍消毒（这是本项目里唯一允许 style 属性的场景，行内样式是公式排版所必需的）。
  // 浏览器环境下 isSupported 恒为 true；仅在无 DOM 环境（SSR / 单测）下才会跳过消毒。
  const safe = DOMPurify.isSupported
    ? String(
        DOMPurify.sanitize(html, {
          ADD_ATTR: ["style", "mathvariant", "display", "xmlns"],
        }),
      )
    : html;

  if (cache.size >= cacheLimit) cache.clear();
  cache.set(cacheKey, safe);
  return safe;
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char,
  );
}
