import { useEffect, useMemo, useRef, useState } from 'react'
import { HashRouter, Link, Route, Routes, useParams } from 'react-router-dom'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { Editor, defaultValueCtx, rootCtx } from '@milkdown/core'
import { nord } from '@milkdown/theme-nord'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { katexOptionsCtx, math } from '@milkdown/plugin-math'
import { upload } from '@milkdown/plugin-upload'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { extractMath, katexOptions, restoreMath } from './lib/math'
import { mathBlockPlugins } from './lib/math-block-node'
import { createSlug, fetchExistingSha, fetchRepoSlugs, postPath, uniqueSlug } from './lib/slug'
import { commonmarkWithoutEmptyLinePlaceholder, specialBlockPlugins } from './lib/special-block-plugins'
import './App.css'

type Post = {
  slug: string
  title: string
  description: string
  date: string
  tags: string[]
  body: string
}

const postModules = import.meta.glob('../content/posts/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

function parsePost(source: string, path: string): Post {
  const match = source.match(/^---\s*([\s\S]*?)\s*---\s*([\s\S]*)$/)
  const metadata = match?.[1] ?? ''
  const body = match?.[2]?.trim() ?? source.trim()
  const read = (key: string) => metadata.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? ''
  const slug = path.split('/').pop()?.replace(/\.md$/, '') ?? ''
  const tags = (read('tags').replace(/^\[|\]$/g, '').split(',').map((tag) => tag.trim()).filter(Boolean))

  return {
    slug,
    title: read('title') || slug,
    description: read('description'),
    date: read('date') || '未设置日期',
    tags,
    body,
  }
}

const posts = Object.entries(postModules)
  .map(([path, source]) => parsePost(source, path))
  .sort((a, b) => b.date.localeCompare(a.date))

function Layout({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.dataset.theme = next ? 'dark' : 'light'
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="brand" to="/">Jaleef<span>.</span></Link>
        <nav>
          <Link to="/">文章</Link>
          <Link className="write-link" to="/write">写文章</Link>
          <button className="theme-button" onClick={toggleTheme} aria-label="切换主题">{dark ? '☀' : '☾'}</button>
        </nav>
      </header>
      <main>{children}</main>
      <footer>用文字记录思考 · Powered by GitHub Pages</footer>
    </div>
  )
}

function HomePage() {
  return (
    <section className="home-page">
      <div className="intro">
        <p className="eyebrow">PERSONAL BLOG</p>
        <h1>记录代码，也记录<br /><em>一路上的思考。</em></h1>
        <p className="intro-copy">这里是我的写作空间，分享前端开发、技术实践，以及那些值得留下来的想法。</p>
      </div>
      <div className="section-heading"><h2>最新文章</h2><span>{posts.length} 篇文章</span></div>
      <div className="post-list">
        {posts.length === 0 && <p className="empty">还没有文章，去写下第一篇吧。</p>}
        {posts.map((post) => <PostCard key={post.slug} post={post} />)}
      </div>
    </section>
  )
}

function PostCard({ post }: { post: Post }) {
  return (
    <Link className="post-card" to={`/post/${post.slug}`}>
      <div className="post-date">{post.date}</div>
      <div>
        <h3>{post.title}</h3>
        <p>{post.description || '点击阅读这篇文章。'}</p>
        <div className="tags">{post.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      </div>
      <span className="arrow">↗</span>
    </Link>
  )
}

const repoOwner = 'Jaleef'
const repoName = 'Jaleef.github.io'
const postsDirectory = 'content/posts'

function DangerZone({ post }: { post: Post }) {
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState('')
  const [status, setStatus] = useState('')
  const [working, setWorking] = useState(false)

  const gitHubRequest = (path: string, init: RequestInit, authToken: string) => fetch(
    `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        ...init.headers,
      },
    },
  )

  const removePost = async () => {
    if (!token.trim()) {
      setStatus('请输入 GitHub Token，删除操作必须经过确认。')
      return
    }
    setWorking(true)
    setStatus('正在校验 Token 并删除……')
    const path = `${postsDirectory}/${post.slug}.md`
    try {
      // 删除文件需要该文件的 sha，先读取再提交删除。
      const readResponse = await gitHubRequest(path, { method: 'GET' }, token.trim())
      if (readResponse.status === 401) throw new Error('Token 无效或已过期，请重新生成。')
      if (readResponse.status === 403) throw new Error('Token 权限不足，需要目标仓库的 Contents: Read and write。')
      if (readResponse.status === 404) throw new Error('未找到该文章文件，或 Token 没有访问该仓库的权限。')
      if (!readResponse.ok) throw new Error('读取文章失败，请稍后重试。')
      const sha = (await readResponse.json() as { sha?: string }).sha
      if (!sha) throw new Error('无法获取文件版本信息，已取消删除。')

      const deleteResponse = await gitHubRequest(path, {
        method: 'DELETE',
        body: JSON.stringify({ message: `delete: ${post.title}`, sha }),
      }, token.trim())
      if (!deleteResponse.ok) throw new Error('删除失败，请检查 Token 权限和仓库地址。')

      setToken('')
      setStatus('')
      window.location.hash = '#/'
      window.location.reload()
    } catch (error) {
      setWorking(false)
      setStatus(error instanceof Error ? error.message : '删除失败，请稍后重试。')
    }
  }

  return (
    <section className={`danger-zone ${open ? 'is-open' : ''}`}>
      {!open
        ? <button className="danger-button" onClick={() => setOpen(true)}>删除这篇文章</button>
        : (
          <>
            <p className="danger-hint">删除会从仓库移除 <code>{`${postsDirectory}/${post.slug}.md`}</code>，GitHub Pages 随后会重新部署，此操作不可撤销。</p>
            <div className="danger-controls">
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="GitHub Fine-grained Token（需 Contents: Read and write）"
              />
              <button className="danger-confirm" onClick={removePost} disabled={working}>
                {working ? '删除中……' : '确认删除'}
              </button>
              <button className="secondary-button" onClick={() => setOpen(false)} disabled={working}>取消</button>
            </div>
            <p className="danger-hint">Token 仅用于本次删除，不会保存到任何地方，刷新页面即消失。</p>
          </>
        )}
      {status && <p className="status">{status}</p>}
    </section>
  )
}

function PostPage() {
  const { slug } = useParams()
  const post = posts.find((item) => item.slug === slug)
  // 先把公式抽成占位符再交给 marked，最后用 KaTeX 结果还原；
  // 用 useMemo 避免切换主题等重渲染时反复解析与渲染公式。
  const html = useMemo(() => {
    if (!post) return ''
    const { markdown, expressions } = extractMath(post.body)
    const sanitized = DOMPurify.sanitize(marked.parse(markdown) as string)
    return restoreMath(sanitized, expressions)
  }, [post])
  if (!post) return <div className="not-found"><h1>找不到这篇文章</h1><Link to="/">返回文章列表</Link></div>

  return (
    <article className="post-page">
      <Link className="back-link" to="/">← 返回文章列表</Link>
      <p className="eyebrow">{post.date}</p>
      <h1>{post.title}</h1>
      <p className="post-description">{post.description}</p>
      <div className="tags">{post.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
      {/* key 让切到另一篇文章时自动清空 token 与状态 */}
      <DangerZone key={post.slug} post={post} />
    </article>
  )
}

function EditorContent({ initialValue, onChange }: { initialValue: string; onChange: (value: string) => void }) {
  useEditor((root) => Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, initialValue)
      ctx.set(katexOptionsCtx.key, katexOptions)
      ctx.get(listenerCtx).markdownUpdated((_, markdown) => onChange(markdown))
    })
    .config(nord)
    .use(commonmarkWithoutEmptyLinePlaceholder)
    .use(listener)
    // 官方 math 插件提供 remark 解析、KaTeX 配置、行内公式与 `$$ ` 输入规则
    .use(math)
    // 再为 math_block 节点挂上可编辑视图，解决「光标进不去、公式无法修改」的问题
    .use(mathBlockPlugins)
    // 保证代码块、公式块等特殊块后面总能继续写（末尾自动补段落 + 方向键兜底）
    .use(specialBlockPlugins)
    .use(upload))
  return <Milkdown />
}

/** 发布时若文件名与仓库中已有文章冲突，交给用户决定用哪种方案。 */
type PendingPlan = {
  slug: string
  sha: string
  title: string
  body: string
}

function WritePage() {
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [body, setBody] = useState('# 开始写作\n\n在这里写下你的文章内容……\n\n数学公式用 LaTeX 语法：行内写作 $E = mc^2$，独立成行用两个美元符号包裹。\n')
  const [token, setToken] = useState('')
  const [status, setStatus] = useState('')
  const [followCursor, setFollowCursor] = useState(false)
  // 文件名冲突时待用户确认的方案
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null)
  const [pendingAlternative, setPendingAlternative] = useState('')

  // 已被占用的 slug：本地构建产物里的文章
  const takenSlugs = useMemo(() => new Set(posts.map((post) => post.slug)), [])
  // 用户填了 slug 就用它，否则由标题推导；两者都会经过安全化处理
  const preferredSlug = useMemo(() => createSlug(slug) || createSlug(title), [slug, title])
  // 预览用：偏好名若与已有文章冲突，自动换成不冲突的名字
  const resolvedSlug = useMemo(() => uniqueSlug(preferredSlug, takenSlugs), [preferredSlug, takenSlugs])

  useEffect(() => {
    if (!followCursor) return

    const keepCursorCentered = () => {
      const editor = editorContainerRef.current?.querySelector('.editor')
      const selection = window.getSelection()
      if (!editor || !selection?.rangeCount || !selection.anchorNode || !editor.contains(selection.anchorNode)) return

      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      if (!rect.height && !rect.width) return

      const viewportCenter = window.innerHeight / 2
      const cursorCenter = rect.top + rect.height / 2
      const distance = cursorCenter - viewportCenter
      if (Math.abs(distance) > 32) {
        window.scrollBy({ top: distance, behavior: 'smooth' })
      }
    }

    const editor = editorContainerRef.current
    editor?.addEventListener('keyup', keepCursorCentered)
    editor?.addEventListener('mouseup', keepCursorCentered)
    document.addEventListener('selectionchange', keepCursorCentered)
    return () => {
      editor?.removeEventListener('keyup', keepCursorCentered)
      editor?.removeEventListener('mouseup', keepCursorCentered)
      document.removeEventListener('selectionchange', keepCursorCentered)
    }
  }, [followCursor])

  /**
   * 真正把文章写入仓库。
   *
   * 关键点：GitHub Contents API 在**更新已存在的文件时必须带上该文件的 sha**，
   * 否则会返回 422。旧实现在重复发布同一标题时必然失败，就是漏了这一步。
   */
  const writePost = async (options: { slug: string, sha?: string }) => {
    const content = `---\ntitle: ${title.trim()}\ndescription: ${description.trim()}\ndate: ${new Date().toISOString().slice(0, 10)}\ntags: [${tags.split(',').map((tag) => tag.trim()).filter(Boolean).join(', ')}]\n---\n\n${body.trim()}\n`
    const url = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${postPath(options.slug)}`
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `${options.sha ? 'update' : 'post'}: ${title.trim()}`,
        content: btoa(unescape(encodeURIComponent(content))),
        ...(options.sha ? { sha: options.sha } : {}),
      }),
    })
    if (response.ok) return
    if (response.status === 401) throw new Error('Token 无效或已过期，请重新生成。')
    if (response.status === 403) throw new Error('Token 权限不足，需要目标仓库的 Contents: Read and write。')
    if (response.status === 404) throw new Error('找不到仓库，请检查 Token 是否有权访问该仓库。')
    if (response.status === 422) throw new Error('文件名冲突：仓库中已存在同名文章，请换个标题或选择更新原文。')
    throw new Error('发布失败，请检查 Token 权限和仓库地址。')
  }

  const finishPublish = (slug: string, existed: boolean) => {
    setPendingPlan(null)
    setPendingAlternative('')
    setToken('')
    setStatus(existed
      ? `已更新文章 ${slug}.md。GitHub Pages 正在重新部署，约一分钟后刷新页面可见。`
      : `发布成功：content/posts/${slug}.md。GitHub Pages 正在部署，约一分钟后可访问。`)
  }

  /** 冲突方案一：带上已有文件的 sha 覆盖原文。 */
  const publishOverwrite = async (plan: PendingPlan) => {
    setStatus('正在更新原文……')
    try {
      const fresh = await fetchExistingSha(repoOwner, repoName, plan.slug, token.trim())
      if (!fresh) {
        setStatus('该文件已不存在，请重新点击「发布文章」。')
        return
      }
      await writePost({ slug: plan.slug, sha: fresh.sha })
      finishPublish(plan.slug, true)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '更新失败，请稍后重试。')
    }
  }

  /** 冲突方案二：用不冲突的新文件名发布，保留原文。 */
  const publishAsNew = async (alternative: string) => {
    setStatus('正在另存为新文章……')
    try {
      const existing = await fetchExistingSha(repoOwner, repoName, alternative, token.trim())
      if (existing) {
        setStatus(`备用名 ${alternative}.md 也已被占用，请修改标题或手动指定 slug。`)
        return
      }
      await writePost({ slug: alternative })
      finishPublish(alternative, false)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '发布失败，请稍后重试。')
    }
  }

  const publish = async () => {
    if (!title.trim() || !body.trim() || !token.trim()) {
      setStatus('请填写标题、正文和 GitHub Token。')
      return
    }
    setPendingPlan(null)
    setStatus('正在检查文件名……')
    try {
      // 合并「本地已有文章」与「仓库里已有但尚未构建的文件」，避免悄悄覆盖旧文章
      const repoSlugs = await fetchRepoSlugs(repoOwner, repoName, token.trim())
      const occupied = new Set([...takenSlugs, ...repoSlugs])
      const chosen = preferredSlug || `post-${Date.now()}`
      const existing = await fetchExistingSha(repoOwner, repoName, chosen, token.trim())

      // 文件名已被占用：交给用户决定「更新原文」还是「另存为新文章」
      if (existing) {
        setStatus('')
        setPendingPlan({ slug: chosen, sha: existing.sha, title: title.trim(), body: body.trim() })
        setPendingAlternative(uniqueSlug(chosen, occupied))
        return
      }

      const safeSlug = occupied.has(chosen) ? uniqueSlug(chosen, occupied) : chosen
      setStatus('正在发布……')
      const recheck = safeSlug === chosen ? null : await fetchExistingSha(repoOwner, repoName, safeSlug, token.trim())
      await writePost({ slug: safeSlug, sha: recheck?.sha })
      finishPublish(safeSlug, Boolean(recheck))
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '发布失败，请稍后重试。')
    }
  }

  return (
    <section className="write-page">
      <div className="write-toolbar">
        <Link className="back-link" to="/">← 返回</Link>
        <div className="write-actions">
          {/* Token 与发布按钮同处一行：点完发布立刻能看到结果，不必滚到底部检查 */}
          <input
            className="token-input"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="GitHub Token（Contents: Read and write）"
            aria-label="GitHub Fine-grained Token"
          />
          <button className={`secondary-button ${followCursor ? 'is-active' : ''}`} onClick={() => setFollowCursor((enabled) => !enabled)} aria-pressed={followCursor}>↕ 跟随光标</button>
          <button className="secondary-button" onClick={() => setToken('')}>清除 Token</button>
          <button className="primary-button" onClick={publish}>发布文章</button>
        </div>
      </div>
      {/* 发布状态紧贴工具栏，出错时就在按钮正下方，一眼可见 */}
      {status && <p className="status toolbar-status">{status}</p>}
      {/* 文件名冲突：给出两个明确的选择，而不是直接报错 */}
      {pendingPlan && (
        <div className="conflict-box">
          <p className="conflict-title">仓库中已存在 <code>content/posts/{pendingPlan.slug}.md</code>，你想怎么处理？</p>
          <div className="conflict-actions">
            <button className="primary-button" onClick={() => publishOverwrite(pendingPlan)}>更新原文</button>
            {pendingAlternative && (
              <button className="secondary-button conflict-new" onClick={() => publishAsNew(pendingAlternative)}>
                另存为新文章（{pendingAlternative}.md）
              </button>
            )}
            <button className="secondary-button" onClick={() => setPendingPlan(null)}>取消</button>
          </div>
          <p className="conflict-hint">「更新原文」会覆盖仓库中的同名文件；「另存为新文章」会保留原文，用新的文件名发布。</p>
        </div>
      )}
      <input className="title-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="文章标题" />
      <div className="post-options">
        <input
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          placeholder="URL slug（留空则按标题自动生成）"
        />
        <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="文章摘要（可选）" />
        <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="标签，用逗号分隔" />
      </div>
      {title.trim() && (
        <p className="slug-preview">
          将发布为 <code>{resolvedSlug}.md</code>
          {slug.trim() && createSlug(slug) !== slug.trim() ? <span className="slug-warning">（自定义 slug 中的空格与特殊字符已替换为连字符）</span> : null}
        </p>
      )}
      <MilkdownProvider><div ref={editorContainerRef} className="editor-wrap"><EditorContent initialValue={body} onChange={setBody} /></div></MilkdownProvider>
      <p className="token-hint">Token 仅用于本次发布，不会保存到任何地方；刷新页面后需要重新输入。</p>
    </section>
  )
}

function App() {
  useEffect(() => {
    document.documentElement.dataset.theme = localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'
  }, [])
  return <HashRouter><Layout><Routes><Route path="/" element={<HomePage />} /><Route path="/post/:slug" element={<PostPage />} /><Route path="/write" element={<WritePage />} /><Route path="*" element={<HomePage />} /></Routes></Layout></HashRouter>
}

export default App
