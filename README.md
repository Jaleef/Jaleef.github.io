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

## 依赖维护须知

**不要运行 `npm audit fix --force`。** 它为了解决 `@milkdown/react` 传递依赖里的 katex 漏洞，会把
`@milkdown/react` 降到 `7.6.1`；该版本硬钉 `@milkdown/kit@7.6.1`，进而带入一份嵌套的
`@milkdown/core@7.6.1`，与顶层 core 形成两份互不兼容的类型副本，CI 会报
`Type 'Editor' is not assignable to type 'Editor'`。

Milkdown 的多个包之间存在精确版本互钉关系，因此本项目将所有 `@milkdown/*` 锁定为**同一精确版本**
（不使用 `^`）。升级时必须整组一起升，并在本地跑通 `npm run build`。

剩余的低危告警来自 `@milkdown/crepe → remark-math → katex`，只影响数学公式渲染，
而本站不使用数学公式（正文由 `marked` + `DOMPurify` 渲染）。用 `npm run audit` 查看详情。

修改依赖后请务必同时提交 `package.json` 与 `package-lock.json`，因为 CI 使用 `npm ci` 严格按锁文件安装。
