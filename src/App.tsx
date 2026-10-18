import { lazy, Suspense } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { PageLoading } from "./components/PageLoading";
import { HomePage } from "./features/posts";

/*
 * 文章页与写作页依赖 marked、KaTeX、remark 等较大的解析库，按路由拆包：
 * 首屏（文章列表）只需要 React + 路由 + 每篇文章的元信息。
 */
const PostPage = lazy(() =>
  import("./features/posts/PostPage").then((module) => ({
    default: module.PostPage,
  })),
);
const WriteRoute = lazy(() =>
  import("./features/write").then((module) => ({
    default: module.WriteRoute,
  })),
);

/**
 * 应用入口：只声明路由表。
 * 页面实现在 features/ 下，通用组件在 components/，无 UI 的逻辑在 lib/。
 */
export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/post/:slug" element={<PostPage />} />
            <Route path="/write" element={<WriteRoute />} />
            <Route path="/write/:slug" element={<WriteRoute />} />
            <Route path="*" element={<HomePage />} />
          </Routes>
        </Suspense>
      </Layout>
    </HashRouter>
  );
}
