/**
 * Markdown → HTML 渲染管线
 * ------------------------
 * marked 不内置数学公式支持，这里用 remark-math 负责识别 `$...$` 与 `$$...$$`：
 * 先用 unified + remark-parse + remark-math 解析一遍，只为了拿到公式节点的准确偏移量，
 * 把它们替换成不透明占位符交给 marked 处理正文，最后再把占位符换回 KaTeX 渲染结果。
 * 这样能复用 remark-math 的解析规则，代码块里的 $ 不会被误判。
 *
 * 文章页与编辑器预览都调用 renderMarkdown，「预览所见」即「读者所见」。
 */

import DOMPurify from "dompurify";
import { marked } from "marked";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { Plugin } from "unified";
import { renderMath } from "./math";

type Point = { line: number; column: number; offset?: number };

type Node = {
  type: string;
  value?: string;
  children?: Node[];
  position?: { start: Point; end: Point };
};

type MathExpression = { latex: string; display: boolean };

/**
 * 占位符用 Unicode 私有使用区字符包裹：正文里不可能出现，
 * 也不会被 marked 改写或转义（控制字符会触发 no-control-regex，故不用）。
 */
const tokenStart = "\uE000math:";
const tokenEnd = "\uE001";
const tokenPattern = /\uE000math:(\d+)\uE001/g;

// 显式开启单美元行内公式，确保与编辑器侧配置一致。
const mathSyntax = { singleDollarTextMath: true };

const mathProcessor = unified()
  .use(remarkParse)
  .use(
    remarkMath as unknown as Plugin<[typeof mathSyntax?], Node, Node>,
    mathSyntax,
  );

function collapseEscapes(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    result +=
      value[index] === "\\" && value[index + 1] === "\\"
        ? ((index += 1), "\\")
        : value[index];
  }
  return result;
}

/**
 * 把 Markdown 里的数学公式替换为占位符。
 * 返回替换后的 Markdown 与按序排列的公式列表。
 */
export function extractMath(markdown: string): {
  markdown: string;
  expressions: MathExpression[];
} {
  const expressions: MathExpression[] = [];

  try {
    const parsed = mathProcessor.parse(markdown) as unknown as Node;
    const hits: {
      start: number;
      end: number;
      latex: string;
      display: boolean;
    }[] = [];

    const walk = (node: Node) => {
      if (node.type === "inlineMath" || node.type === "math") {
        const start = node.position?.start.offset;
        const end = node.position?.end.offset;
        if (typeof start === "number" && typeof end === "number") {
          hits.push({
            start,
            end,
            latex: collapseEscapes(node.value ?? ""),
            display: node.type === "math",
          });
        }
        return;
      }
      node.children?.forEach(walk);
    };
    walk(parsed);

    if (!hits.length) return { markdown, expressions };

    // 从后往前替换，避免前面的替换影响后面命中的偏移量。
    let result = markdown;
    hits
      .sort((a, b) => b.start - a.start)
      .forEach((hit) => {
        const token = `${tokenStart}${expressions.length}${tokenEnd}`;
        expressions.push({ latex: hit.latex, display: hit.display });
        result = `${result.slice(0, hit.start)}${token}${result.slice(hit.end)}`;
      });
    expressions.reverse();

    return { markdown: result, expressions };
  } catch {
    // 解析异常时退回原文：宁可公式不渲染，也不能让整篇文章打不开。
    return { markdown, expressions: [] };
  }
}

/** 把 marked 产出的 HTML 里的占位符换回渲染好的公式。 */
export function restoreMath(
  html: string,
  expressions: MathExpression[],
): string {
  if (!expressions.length) return html;
  return html.replace(tokenPattern, (token, index: string) => {
    const expression = expressions[Number(index)];
    if (!expression) return token;
    const rendered = renderMath(expression.latex, expression.display);
    return expression.display
      ? `<div class="math-block">${rendered}</div>`
      : `<span class="math-inline">${rendered}</span>`;
  });
}

/** 把 Markdown 渲染成可直接注入的 HTML（已消毒，含数学公式）。 */
export function renderMarkdown(source: string): string {
  const { markdown, expressions } = extractMath(source);
  const sanitized = String(DOMPurify.sanitize(marked.parse(markdown) as string));
  return restoreMath(sanitized, expressions);
}
