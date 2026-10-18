import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTheme } from "../hooks/useTheme";
import { ScrollJumper } from "./ScrollJumper";

/** 站点外壳：页头、导航、页脚。所有路由页面都渲染在 children 里。 */
export function Layout({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme();

  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="brand" to="/">
          Jaleef<span>.</span>
        </Link>
        <nav>
          <Link to="/">文章</Link>
          <Link className="write-link" to="/write">
            写文章
          </Link>
          <button
            className="theme-button"
            onClick={toggle}
            aria-label="切换主题"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </nav>
      </header>
      <main>{children}</main>
      <footer>用文字记录思考 · Powered by GitHub Pages</footer>
      <ScrollJumper />
    </div>
  );
}
