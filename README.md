# Jaleef Blog

一个基于 React、TypeScript、Vite 和 GitHub Pages 的轻量博客。写作与编辑在 `/write` 进行，采用**左右分栏的 Markdown 编辑器**（左侧写源文件、右侧实时预览），成稿后直接发布到 GitHub 仓库。

## 编辑器

- 左栏是 Markdown 源文件，右栏预览；预览复用与文章页完全相同的渲染管线，所见即所得。
- 支持行内公式 `$...$` 与块级公式 `$$...$$`（KaTeX 渲染）。
- Tab 键插入两个空格；滚动时右栏按比例跟随。
- 预览渲染在输入间隙进行（`useDeferredValue`），长文输入不会卡顿。

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

## 构建检查

```bash
npm run lint
npm run build
```

## 依赖维护须知

**不要运行 `npm audit fix --force`。** 它为了消除 katex 的传递依赖告警，会选择降级方案而不是升级；
历史上它把 `@milkdown/react` 降到 `7.6.1`，连带引入一份嵌套的旧 `@milkdown/core`，
使 CI 报出 `Type 'Editor' is not assignable to type 'Editor'`。

剩余的低危告警来自 `remark-math → micromark-extension-math → katex`，只影响数学公式渲染；
该漏洞需要主动用 KaTeX 解析不可信输入才会触发，本站公式均由作者自己书写，
且渲染结果还会经过一层 `DOMPurify` 消毒。用 `npm run audit` 查看详情。

修改依赖后请务必同时提交 `package.json` 与 `package-lock.json`，因为 CI 使用 `npm ci` 严格按锁文件安装。
