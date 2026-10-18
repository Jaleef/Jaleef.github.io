# Jaleef Blog

一个基于 React、TypeScript、Vite 和 GitHub Pages 的轻量博客。写作与编辑在 `/write` 进行，采用**左右分栏的 Markdown 编辑器**（左侧写源文件、右侧实时预览），成稿后直接发布到 GitHub 仓库。

## 加载策略

首屏（文章列表）只加载 React、路由与每篇文章的元信息，约 **260 KB**；渲染库与正文都按需加载：

- **路由分包**：文章详情页与写作页通过 `React.lazy` 拆包，`marked`、KaTeX、remark 等解析库
  只在真正打开文章 / 编辑器时才下载，首屏 CSS 也不再包含 KaTeX 字体。
- **构建期索引**：`vite/postsIndexPlugin.ts` 在构建时把每篇文章解析成 `PostSummary`
  （标题 / 摘要 / 日期 / 标签）写入虚拟模块 `virtual:posts-index`，随首屏下发；
  正文通过 `import.meta.glob` 按需动态导入，**打开哪篇加载哪篇**，不再把所有正文打进首屏。
- **按需渲染**：没有公式的页面不会下载 KaTeX 的样式与字体。

## 主题

默认 **GitHub Dark**，可一键切换到 **GitHub Light**；配色取自 GitHub Primer 的语义变量
（`canvas` / `fg` / `muted` / `border` / `accent` / `danger`），全部集中在
[`src/styles/tokens.css`](src/styles/tokens.css)，样式文件里没有硬编码颜色。

深色是 CSS 的默认值（`:root` 即 GitHub Dark），浅色通过 `<html data-theme="light">` 覆盖，
因此首屏在 JS 执行前就已经是深色，不会闪白。用户的选择记在 `localStorage`（键 `blog-theme:v2`）。

## 目录结构

代码按「页面独占的逻辑 → 跨页面复用 → 纯工具」分层，`App.tsx` 只保留路由表：

```
src/
├── App.tsx                 路由表（唯一入口，不含业务逻辑）
├── main.tsx                挂载与主题预热
├── virtual.d.ts            构建期虚拟模块的类型声明
├── features/               按页面划分的业务模块
│   ├── posts/              首页 / 文章详情 / 删除
│   │   ├── posts.ts        元信息索引 + 正文按需加载
│   │   ├── useLoadedPost.ts    异步加载正文（带 slug 校验，避免闪现上一篇）
│   │   ├── HomePage.tsx
│   │   ├── PostPage.tsx
│   │   ├── PostCard.tsx
│   │   └── DeletePostPanel.tsx
│   └── write/              写作与重新发布
│       ├── WritePage.tsx   组装页面；WriteRoute 负责等待正文并按 slug 重挂载
│       ├── usePostDraft.ts 表单状态 + 文件名（slug）推导
│       ├── usePublish.ts   发布状态机：Token、进度、文件名冲突
│       ├── publishPost.ts  纯函数：新建 / 覆盖 / 另存 / 改名清理
│       ├── draftStorage.ts / useDraftAutosave.ts   本机草稿暂存
│       ├── frontMatter.ts  Front Matter 拼装
│       └── WriteToolbar / EditBanner / ConflictPrompt / PostMetaFields / DraftRestorePrompt
├── components/             跨页面展示组件
│   ├── Layout.tsx          站点外壳（页头 / 导航 / 页脚）
│   ├── MarkdownEditor.tsx  分栏编辑器
│   ├── MarkdownBody.tsx    渲染后的正文
│   ├── PageLoading.tsx     路由分包加载占位
│   └── BackLink.tsx / TagList.tsx
├── hooks/
│   ├── useTheme.ts         浅色 / 深色主题
│   └── useUnsavedChangesWarning.ts  离开页面前的未保存提醒
├── lib/                    无 UI 的纯逻辑
│   ├── github.ts           GitHub Contents API（sha / 422 / 中文 Base64）
│   ├── config.ts           仓库与路径配置
│   ├── post.ts             Front Matter 解析、摘要、排序
│   ├── markdown.ts         Markdown → HTML（含公式占位符流程）
│   ├── math.ts             KaTeX 渲染与缓存
│   ├── slug.ts             文件名生成与去重
│   ├── links.ts / route.ts 站内链接、路由参数解码
│   └── theme.ts            主题读写
├── styles/                 样式按主题拆分，由 index.css 按层叠顺序导入
│   ├── tokens.css          颜色变量（浅色 / 深色）
│   ├── base.css            全局排版
│   ├── common.css          返回链接、编辑入口、状态提示
│   ├── layout.css / home.css / post.css / write.css / editor.css
│   ├── markdown.css        正文排版（含表格、公式）
│   ├── responsive.css      媒体查询（必须最后导入）
│   └── index.css           样式入口
└── assets/
vite/postsIndexPlugin.ts    构建期文章索引插件
content/posts/*.md          文章源文件（构建时读取）
```

新增页面时按同样的分工落位：页面状态放 `features/<页面>/use*.ts`，无 UI 逻辑放 `lib/`，
样式加到对应的 `styles/*.css` 并在 `styles/index.css` 里按顺序登记。

## 编辑器

- 左栏是 Markdown 源文件，右栏预览；预览复用与文章页完全相同的渲染管线，所见即所得。
- 支持行内公式 `$...$` 与块级公式 `$$...$$`（KaTeX 渲染）。
- Tab 键插入两个空格；滚动时右栏按比例跟随。
- 预览渲染在输入间隙进行（`useDeferredValue`），长文输入不会卡顿。

## 草稿

编辑内容会停止输入 600ms 后自动暂存到本机 `localStorage`（按「新建 / 每篇文章」分开存），
不上传、不写入仓库：

- 刷新或误关标签页后重新打开写作页，会提示「发现本机自动保存的草稿」并可一键恢复或丢弃；
- 有未保存改动时关闭标签页会触发浏览器的离开确认；
- 发布成功后草稿自动清除，同时解除离开提醒。

## 本地开发

```bash
npm install
npm run dev
```

## 在线发布文章

1. 在 GitHub 创建 Fine-grained Personal Access Token。
2. 将 Repository access 限制为 `Jaleef/Jaleef.github.io`。
3. 为该仓库开启 `Contents: Read and write` 权限。
4. 打开网站的“写文章”页面，填写标题、正文和 Token。
5. 点击“发布文章”，文章会写入 `content/posts/`，随后由 GitHub Actions 自动部署。

Token 只在当前页面内存中使用，不会写入代码或仓库；刷新页面后需要重新输入。不要在公共电脑上使用 Token。

## 文章格式

文章保存在 `content/posts/*.md`，包含 Front Matter：

```md
---
title: 文章标题
description: 文章摘要
date: 2026-09-16
tags: [React, TypeScript]
---
```

## 检查与测试

```bash
npm run lint
npm test        # Vitest：slug / Front Matter / 发布流程 / 公式切分
npm run build
```

单元测试只覆盖纯逻辑（不依赖浏览器）：文件名生成、Front Matter 往返解析、
发布流程的分支（新建 / 冲突 / 覆盖 / 另存 / 改名清理）、公式占位符提取。
交互与样式仍需在浏览器里验证。

CI（`.github/workflows/deploy.yml`）会依次执行 `npm ci`、lint、test、build，任一失败都不会部署。

## 依赖维护须知

**不要运行 `npm audit fix --force`。** 它为了消除 katex 的传递依赖告警，会选择降级方案而不是升级；
历史上它把 `@milkdown/react` 降到 `7.6.1`，连带引入一份嵌套的旧 `@milkdown/core`，
使 CI 报出 `Type 'Editor' is not assignable to type 'Editor'`。

剩余的低危告警来自 `remark-math → micromark-extension-math → katex`，只影响数学公式渲染；
该漏洞需要主动用 KaTeX 解析不可信输入才会触发，本站公式均由作者自己书写，
且渲染结果还会经过一层 `DOMPurify` 消毒。用 `npm run audit` 查看详情。

修改依赖后请务必同时提交 `package.json` 与 `package-lock.json`，因为 CI 使用 `npm ci` 严格按锁文件安装。
