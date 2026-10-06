import DOMPurify from 'dompurify'
import katex from 'katex'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import type { Plugin } from 'unified'

/**
 * 编辑器（Milkdown + @milkdown/plugin-math）与查看器（marked）共用同一套 KaTeX 配置，
 * 保证同一段 LaTeX 在编辑器和文章页渲染结果一致。
 */
export const katexOptions: katex.KatexOptions = {
  throwOnError: false, // 语法错误时就地显示原文，而不是抛出异常导致整页白屏
  strict: false,       // 放宽非标准命令的告警，避免控制台噪音
  output: 'htmlAndMathml', // 同时输出 MathML，便于无障碍读取与跨浏览器回退
}

const cache = new Map<string, string>()
const cacheLimit = 500

/** 把一段 LaTeX 渲染成 HTML，失败时降级为原文展示。 */
export function renderMath(latex: string, displayMode: boolean): string {
  const source = latex.trim()
  if (!source) return ''
  const cacheKey = `${displayMode ? 'block' : 'inline'}:${source}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  let html: string
  try {
    html = katex.renderToString(source, { ...katexOptions, displayMode })
  } catch {
    html = `<code>${source.replace(/[&<>"]/g, (char) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] ?? char
    ))}</code>`
  }

  // KaTeX 的 HTML 是可信产物，但它会被 dangerouslySetInnerHTML 注入，
  // 所以仍然单独过一遍消毒（这是本项目里唯一允许 style 属性的场景，行内样式是公式排版所必需的）。
  // 浏览器环境下 isSupported 恒为 true；仅在无 DOM 环境（SSR / 单测）下才会跳过消毒。
  const safe = DOMPurify.isSupported
    ? String(DOMPurify.sanitize(html, {
      ADD_ATTR: ['style', 'mathvariant', 'display', 'xmlns'],
    }))
    : html

  if (cache.size >= cacheLimit) cache.clear()
  cache.set(cacheKey, safe)
  return safe
}

/* ------------------------------------------------------------------ *
 * 以下供查看器（marked）使用。
 *
 * marked 不内置数学公式支持，但项目里已经有 remark-math（@milkdown/plugin-math
 * 的依赖）。做法是：用 unified + remark-parse + remark-math 解析一遍 Markdown，
 * 只为了拿到公式节点的准确偏移量，把它们替换成不透明占位符交给 marked 处理正文，
 * 最后再把占位符换回 KaTeX 渲染结果。
 * 这样能复用 remark-math 的解析规则，使编辑器与查看器对同一段 LaTeX
 * 给出一致的识别结果（包括代码块里的 $ 不会被误判）。
 * ------------------------------------------------------------------ */

type Point = { line: number, column: number, offset?: number }

type Node = {
  type: string
  value?: string
  children?: Node[]
  position?: { start: Point, end: Point }
}

/**
 * 占位符用 Unicode 私有使用区字符包裹：正文里不可能出现，
 * 也不会被 marked 改写或转义（控制字符会触发 no-control-regex，故不用）。
 */
const tokenStart = '\uE000math:'
const tokenEnd = '\uE001'
const tokenPattern = /\uE000math:(\d+)\uE001/g

// 显式开启单美元行内公式，确保与编辑器侧配置一致。
const mathSyntax = { singleDollarTextMath: true }

const mathProcessor = unified()
  .use(remarkParse)
  .use(remarkMath as unknown as Plugin<[typeof mathSyntax?], Node, Node>, mathSyntax)

function collapseEscapes(value: string): string {
  let result = ''
  for (let index = 0; index < value.length; index += 1) {
    result += value[index] === '\\' && value[index + 1] === '\\' ? (index += 1, '\\') : value[index]
  }
  return result
}

/**
 * 把 Markdown 里的数学公式替换为占位符。
 * 返回替换后的 Markdown 与按序排列的公式列表。
 */
export function extractMath(markdown: string): { markdown: string, expressions: { latex: string, display: boolean }[] } {
  const expressions: { latex: string, display: boolean }[] = []

  try {
    const parsed = mathProcessor.parse(markdown) as unknown as Node
    const hits: { start: number, end: number, latex: string, display: boolean }[] = []

    const walk = (node: Node) => {
      if (node.type === 'inlineMath' || node.type === 'math') {
        const start = node.position?.start.offset
        const end = node.position?.end.offset
        if (typeof start === 'number' && typeof end === 'number') {
          hits.push({
            start,
            end,
            latex: collapseEscapes(node.value ?? ''),
            display: node.type === 'math',
          })
        }
        return
      }
      node.children?.forEach(walk)
    }
    walk(parsed)

    if (!hits.length) return { markdown, expressions }

    // 从后往前替换，避免前面的替换影响后面命中的偏移量。
    let result = markdown
    hits.sort((a, b) => b.start - a.start).forEach((hit) => {
      const token = `${tokenStart}${expressions.length}${tokenEnd}`
      expressions.push({ latex: hit.latex, display: hit.display })
      result = `${result.slice(0, hit.start)}${token}${result.slice(hit.end)}`
    })
    expressions.reverse()

    return { markdown: result, expressions }
  } catch {
    // 解析异常时退回原文：宁可公式不渲染，也不能让整篇文章打不开。
    return { markdown, expressions: [] }
  }
}

/** 把 marked 产出的 HTML 里的占位符换回渲染好的公式。 */
export function restoreMath(html: string, expressions: { latex: string, display: boolean }[]): string {
  if (!expressions.length) return html
  return html.replace(tokenPattern, (token, index: string) => {
    const expression = expressions[Number(index)]
    if (!expression) return token
    const rendered = renderMath(expression.latex, expression.display)
    return expression.display
      ? `<div class="math-block">${rendered}</div>`
      : `<span class="math-inline">${rendered}</span>`
  })
}
