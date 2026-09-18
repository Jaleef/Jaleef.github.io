import { useEffect, useRef, useState } from 'react'
import { HashRouter, Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { Editor, defaultValueCtx, rootCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { nord } from '@milkdown/theme-nord'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { upload } from '@milkdown/plugin-upload'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
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

function PostPage() {
  const { slug } = useParams()
  const post = posts.find((item) => item.slug === slug)
  if (!post) return <div className="not-found"><h1>找不到这篇文章</h1><Link to="/">返回文章列表</Link></div>
  const html = DOMPurify.sanitize(marked.parse(post.body) as string)

  return (
    <article className="post-page">
      <Link className="back-link" to="/">← 返回文章列表</Link>
      <p className="eyebrow">{post.date}</p>
      <h1>{post.title}</h1>
      <p className="post-description">{post.description}</p>
      <div className="tags">{post.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  )
}

function EditorContent({ initialValue, onChange }: { initialValue: string; onChange: (value: string) => void }) {
  useEditor((root) => Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, initialValue)
      ctx.get(listenerCtx).markdownUpdated((_, markdown) => onChange(markdown))
    })
    .config(nord)
    .use(commonmark)
    .use(listener)
    .use(upload))
  return <Milkdown />
}

function WritePage() {
  const navigate = useNavigate()
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [body, setBody] = useState('# 开始写作\n\n在这里写下你的文章内容……')
  const [token, setToken] = useState('')
  const [status, setStatus] = useState('')
  const [followCursor, setFollowCursor] = useState(false)
  const generatedSlug = slug || title.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')

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

  const publish = async () => {
    if (!title.trim() || !body.trim() || !token.trim()) {
      setStatus('请填写标题、正文和 GitHub Token。')
      return
    }
    setStatus('正在发布……')
    const owner = 'Jaleef'
    const repo = 'Jaleef.github.io'
    const path = `content/posts/${generatedSlug || `post-${Date.now()}`}.md`
    const content = `---\ntitle: ${title.trim()}\ndescription: ${description.trim()}\ndate: ${new Date().toISOString().slice(0, 10)}\ntags: [${tags.split(',').map((tag) => tag.trim()).filter(Boolean).join(', ')}]\n---\n\n${body.trim()}\n`
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `post: ${title.trim()}`, content: btoa(unescape(encodeURIComponent(content))) }),
      })
      if (!response.ok) throw new Error('GitHub API 发布失败，请检查 Token 权限和仓库地址。')
      setStatus('发布成功，GitHub Pages 正在部署。')
      setToken('')
      setTimeout(() => navigate(`/post/${generatedSlug}`), 1200)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '发布失败，请稍后重试。')
    }
  }

  return (
    <section className="write-page">
      <div className="write-toolbar"><Link className="back-link" to="/">← 返回</Link><div><button className={`secondary-button ${followCursor ? 'is-active' : ''}`} onClick={() => setFollowCursor((enabled) => !enabled)} aria-pressed={followCursor}>↕ 跟随光标</button><button className="secondary-button" onClick={() => setToken('')}>清除 Token</button><button className="primary-button" onClick={publish}>发布文章</button></div></div>
      <input className="title-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="文章标题" />
      <div className="post-options">
        <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="URL slug（可选）" />
        <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="文章摘要（可选）" />
        <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="标签，用逗号分隔" />
      </div>
      <MilkdownProvider><div ref={editorContainerRef} className="editor-wrap"><EditorContent initialValue={body} onChange={setBody} /></div></MilkdownProvider>
      <div className="token-box"><label>GitHub Fine-grained Token <span>仅用于本次发布，不会保存</span></label><input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="需要目标仓库 Contents: Read and write 权限" /></div>
      {status && <p className="status">{status}</p>}
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
