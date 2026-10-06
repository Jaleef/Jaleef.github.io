import { NodeSelection, TextSelection } from '@milkdown/prose/state'
import type { EditorView, NodeView, NodeViewConstructor } from '@milkdown/prose/view'
import { mathBlockSchema } from '@milkdown/plugin-math'
import { $view } from '@milkdown/utils'
import { katexOptions } from './math'
import { findTextblockBelow } from './special-block-plugins'
import katex from 'katex'

/**
 * 可编辑的公式块视图（Typora 式交互）
 * ----------------------------------
 * `@milkdown/plugin-math` 的 `math_block` 节点是 `atom: true` 的叶子节点，
 * 且官方没有提供 NodeView：渲染完全依赖 NodeSpec 的 `toDOM`，
 * 结果是一个不可进入的死 DOM —— 光标进不去、内容不能改、退格整块删除。
 *
 * 这里按 Milkdown 官方推荐的方式，为同一个节点名注册 NodeView，
 * 交互设计如下：
 *   - 平时只显示渲染后的公式，LaTeX 源码隐藏（阅读体验）；
 *   - 新建公式块时自动聚焦源码框，可以直接开始输入；
 *   - 点击公式即可进入编辑，源码框出现；
 *   - 在源码框里按 Enter（内容为空则取消整个公式块），
 *     或按 Esc / 向下键，都会退出编辑、回到只显示公式的状态；
 *   - 向下键会确保下方存在一行并把光标移过去，没有就新建一行。
 *
 * Markdown 的解析与序列化仍完全走官方规则，存盘格式不变。
 */

/** 把光标移到某个位置之后一行：已有文本行则进入它，没有就新建一个段落。 */
function exitToNextLine(view: EditorView, position: number, blockSize: number) {
  const { state } = view
  const docSize = state.doc.content.size
  const desired = position + blockSize

  // 向下寻找第一个真正的文本行（会跳过相邻的公式块等原子块）
  const target = findTextblockBelow(state.doc, desired)
  if (target) {
    const transaction = state.tr.setSelection(TextSelection.near(target))
    view.dispatch(transaction)
    view.focus()
    return
  }

  // 下方没有任何文本行：补一个空段落，光标落在其中。
  const paragraph = state.schema.nodes.paragraph?.createAndFill()
  if (!paragraph) {
    view.focus()
    return
  }
  // 用 replaceRangeWith 而不是 replaceRange：它只把 from/to 当提示，
  // 位置放不下时会自动向外寻找能容纳该段落的父节点。
  const insertAt = Math.min(desired, docSize)
  const transaction = state.tr.replaceRangeWith(insertAt, insertAt, paragraph)
  const after = Math.min(insertAt + 1, transaction.doc.content.size)
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(after)))
  view.dispatch(transaction)
  view.focus()
}

export const createMathBlockView: NodeViewConstructor = (
  node,
  view: EditorView,
  getPos,
): NodeView => {
  const wrapper = document.createElement('div')
  wrapper.className = 'math-edit-block'

  const source = document.createElement('textarea')
  source.className = 'math-edit-block__source'
  source.rows = 2
  source.spellcheck = false
  source.setAttribute('aria-label', 'LaTeX 公式源码')

  const preview = document.createElement('div')
  preview.className = 'math-edit-block__preview'

  wrapper.append(source, preview)

  let currentValue = String(node.attrs.value ?? '')
  let syncingFromEditor = false
  let editing = false
  let removing = false
  let destroyed = false

  const renderPreview = (value: string) => {
    preview.replaceChildren()
    if (!value.trim()) {
      const hint = document.createElement('span')
      hint.className = 'math-edit-block__hint'
      hint.textContent = '点击输入 LaTeX 公式'
      preview.append(hint)
      return
    }
    try {
      katex.render(value, preview, { ...katexOptions, displayMode: true })
    } catch {
      const fallback = document.createElement('code')
      fallback.textContent = value
      preview.append(fallback)
    }
  }

  /** 切换「只显示公式」与「显示源码框」两种状态。 */
  const setEditing = (next: boolean) => {
    editing = next
    wrapper.classList.toggle('is-editing', next)
  }

  const beginEditing = () => {
    if (editing) return
    setEditing(true)
    source.focus({ preventScroll: true })
  }

  // 删除公式块并在原位置换成一个普通段落（文档只剩这一块时也不会越界）。
  const removeAndFocusParagraph = () => {
    // 同步重入守卫：这个函数会派发事务，事务会让 NodeView 销毁，
    // 而销毁过程中 textarea 失焦又会再次触发 blur 处理器 -> 递归调用本函数，
    // 第二次就会拿着已经失效的位置去改文档，抛出 "Position N out of range"。
    if (removing) return
    const position = getPos()
    if (typeof position !== 'number') return
    const { state } = view
    // 位置可能已经失效（节点被移除或文档已变），确认该位置上仍是本节点才动手。
    if (position < 0 || position + node.nodeSize > state.doc.content.size) return
    if (state.doc.nodeAt(position) !== node) return
    const paragraph = state.schema.nodes.paragraph?.createAndFill()
    if (!paragraph) return
    removing = true
    const transaction = state.tr.replaceRangeWith(position, position + node.nodeSize, paragraph)
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(position + 1)))
    view.dispatch(transaction)
    view.focus()
  }

  source.value = currentValue
  renderPreview(currentValue)

  // 新插入的空公式块：直接进入编辑状态，省去一次点击。
  // 用 setTimeout 而不是 microtask：NodeView 的 DOM 在构造时还没被挂到文档上，
  // 此时 focus() 不会生效。
  if (!currentValue.trim()) {
    window.setTimeout(() => {
      if (!destroyed && !editing && source.isConnected) beginEditing()
    }, 0)
  }

  source.addEventListener('input', () => {
    const value = source.value
    currentValue = value
    renderPreview(value)
    const position = getPos()
    if (typeof position !== 'number') return
    // 写回节点属性，Markdown 序列化才能拿到最新公式
    syncingFromEditor = true
    view.dispatch(view.state.tr.setNodeMarkup(position, undefined, { value }))
    syncingFromEditor = false
  })

  source.addEventListener('focus', () => setEditing(true))

  source.addEventListener('blur', () => {
    // 视图已销毁就不再有任何动作（销毁过程本身会触发一次 blur）
    if (destroyed) return
    // 焦点仍在公式块内部时不退出编辑状态
    if (wrapper.contains(document.activeElement)) return
    setEditing(false)
    // 没写任何内容的空公式块，失焦后直接移除，避免留下无法操作的空白卡片
    if (!source.value.trim()) removeAndFocusParagraph()
  })

  source.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setEditing(false)
      const position = getPos()
      if (typeof position === 'number') {
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)))
      }
      view.focus()
      return
    }

    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      const position = getPos()
      if (typeof position !== 'number') return
      if (!source.value.trim()) {
        // 空内容按回车 = 放弃这个公式块
        removeAndFocusParagraph()
      } else {
        // 有内容按回车 = 收起源码框，进入下一行继续写
        setEditing(false)
        exitToNextLine(view, position, node.nodeSize)
      }
      return
    }

    if (event.key === 'ArrowDown' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      const position = getPos()
      if (typeof position !== 'number') return
      // 光标已在源码最后一行时才拦截：否则应该让光标在框内继续下移
      const atLastLine = source.selectionStart === source.value.length
      if (!atLastLine) return
      event.preventDefault()
      setEditing(false)
      exitToNextLine(view, position, node.nodeSize)
    }
  })

  // 点击渲染后的公式即进入编辑。
  // 注意不要给预览区加 tabIndex / focus 监听：那样会在「退出编辑」时
  // 与源码框互相抢焦点，形成 focus ↔ blur 循环，导致按向下键永远出不去。
  preview.addEventListener('mousedown', (event) => {
    event.preventDefault()
    beginEditing()
  })

  return {
    dom: wrapper,
    ignoreMutation: () => true,
    // 内部事件交给视图自己处理：避免 ProseMirror 抢走焦点，也保证中文输入法不被打断。
    stopEvent: (event) => wrapper.contains(event.target as Node),
    update: (updated) => {
      if (updated.type.name !== 'math_block') return false
      const value = String(updated.attrs.value ?? '')
      if (syncingFromEditor || value === currentValue) return true
      currentValue = value
      if (document.activeElement !== source) source.value = value
      renderPreview(value)
      return true
    },
    // 用键盘选中该块时不自动抢焦点，避免打断正常的方向键移动；
    // 空块在创建时已经自行进入编辑状态。
    selectNode: () => {
      if (!currentValue.trim() && !editing) beginEditing()
    },
    destroy: () => {
      destroyed = true
      wrapper.remove()
    },
  }
}

export const mathBlockView = $view(mathBlockSchema.node, () => createMathBlockView)

export const mathBlockPlugins = [mathBlockView]
