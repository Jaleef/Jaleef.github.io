# Jaleef Blog

一个基于 React、TypeScript、Vite 和 GitHub Pages 的轻量博客，支持在 `/write` 使用接近 Typora 的所见即所得编辑器写作，并直接发布到 GitHub 仓库。

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
