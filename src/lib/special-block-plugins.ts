import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state'
import type { Node } from '@milkdown/prose/model'
import type { ResolvedPos } from '@milkdown/prose/model'
import { $prose } from '@milkdown/utils'
import { trailing } from '@milkdown/plugin-trailing'
import { commonmark, remarkPreserveEmptyLinePlugin } from '@milkdown/preset-commonmark'

/**
 * 让「特殊块」后面总能继续写
 * --------------------------
 * 代码块、公式块这类块有两类麻烦：
 *   1. 文档以它们结尾时，光标在块内按下键无处可去（后面既没有行，也建不出行）；
 *   2. 多个原子块相邻时（例如两个公式块），中间没有可供光标停留的文本行。
 *
 * 这里组合两件事解决：
 *   - 官方 `@milkdown/plugin-trailing`：自动保证文档最后一个块之后存在一个空段落；
 *   - 一条方向键兜底：光标在普通文本块内、且其下方已无文本行时，补出段落并移过去。
 */

/**
 * 从 `from` 之后往下找第一个可供光标停留的文本块位置。
 *
 * 原子块（公式等）必须排除：它们的 content 是 `text*`，因此 `isTextblock` 为 true，
 * 但光标实际进不去，掉进去就等于光标消失。
 */
export function findTextblockBelow(doc: Node, from: number): ResolvedPos | null {
  const start = Math.max(1, Math.min(from, doc.content.size))
  let found = -1

  doc.nodesBetween(start, doc.content.size, (node, pos) => {
    if (found >= 0) return false
    // 跳过光标所在的这个块本身，只在它「之后」寻找
    if (pos <= start && pos + node.nodeSize > start) return true
    if (node.isTextblock && !node.type.isAtom) {
      found = pos + 1
      return false
    }
    return true
  })

  if (found < 0) return null
  return doc.resolve(Math.min(found, doc.content.size))
}

/** 当前块之后是否已经存在可供光标停留的文本行。 */
export function hasTextblockBelow(doc: Node, from: number): boolean {
  return findTextblockBelow(doc, from) !== null
}

/**
 * 方向键兜底：光标停在普通文本块里、按下键时下方已无文本行，就补一个段落。
 * 这在代码块（以及任何非 paragraph/heading 的文本块）位于文档末尾时尤其有用。
 */
const arrowDownFallback = $prose(() => new Plugin({
  key: new PluginKey('MILKDOWN_ARROW_DOWN_FALLBACK'),
  props: {
    handleKeyDown: (view, event) => {
      if (event.key !== 'ArrowDown') return false
      if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false
      const { state } = view
      const { selection } = state
      if (!selection.empty) return false
      const { $from } = selection
      // 只处理普通文本块内部的光标；原子块由各自的 NodeView 负责
      if (!$from.parent.isTextblock || $from.parent.type.isAtom) return false
      // 只处理「下方已无文本行」的情况，否则交回 ProseMirror 正常移动光标
      if (hasTextblockBelow(state.doc, $from.pos)) return false
      const paragraph = state.schema.nodes.paragraph?.createAndFill()
      if (!paragraph) return false
      event.preventDefault()
      const insertAt = state.doc.content.size
      const transaction = state.tr.insert(insertAt, paragraph)
      transaction.setSelection(TextSelection.near(transaction.doc.resolve(insertAt + 1)))
      view.dispatch(transaction)
      view.focus()
      return true
    },
  },
}))

// trailing 本身是插件数组，用 flat 展平，避免把嵌套数组交给编辑器
export const specialBlockPlugins = [trailing, arrowDownFallback].flat()

/**
 * 去掉 commonmark 预设里的「保留空行」插件。
 *
 * 它会把空段落序列化成 `html` 占位节点 `<br />`（见 preset-commonmark 里的
 * EMPTY_LINE_PLACEHOLDER）。而编辑器为了让光标能落在末尾特殊块之后，
 * 本来就会自动补一个空段落 —— 两者叠加就会在文章末尾凭空写入一行 `<br />`。
 * 移除该插件后，空段落序列化为真正的空行，不再产生多余 HTML。
 */
export const commonmarkWithoutEmptyLinePlaceholder = commonmark.filter(
  // 注意 `$remark` 返回的是 [plugin, options] 数组，而 commonmark 预设里是把这两项
  // 各自展开插入的，所以要按成员判断，不能拿整个数组去比较。
  (plugin) => !remarkPreserveEmptyLinePlugin.includes(plugin as never),
)
