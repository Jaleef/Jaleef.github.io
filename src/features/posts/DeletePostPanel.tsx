import { useState } from "react";
import { postPath } from "../../lib/config";
import { deletePost } from "../../lib/github";
import type { PostSummary } from "../../lib/post";

/**
 * 删除文章：需要用 GitHub Token 二次确认的「危险操作」区域。
 *
 * 删除接口必须带文件的 sha，这里由 lib/github 内部先读后删；
 * Token 只存在组件状态里，刷新页面即消失。
 */
export function DeletePostPanel({ post }: { post: PostSummary }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const path = postPath(post.slug);

  const remove = async () => {
    if (!token.trim()) {
      setStatus("请输入 GitHub Token，删除操作必须经过确认。");
      return;
    }
    setWorking(true);
    setStatus("正在校验 Token 并删除……");
    try {
      await deletePost({
        slug: post.slug,
        token: token.trim(),
        message: `delete: ${post.title}`,
      });
      setToken("");
      setStatus("");
      // 构建产物是静态的，删完必须重新加载才能反映仓库的最新状态
      window.location.hash = "#/";
      window.location.reload();
    } catch (error) {
      setWorking(false);
      setStatus(
        error instanceof Error ? error.message : "删除失败，请稍后重试。",
      );
    }
  };

  return (
    <section className={`danger-zone ${open ? "is-open" : ""}`}>
      {!open ? (
        <button className="danger-button" onClick={() => setOpen(true)}>
          删除这篇文章
        </button>
      ) : (
        <>
          <p className="danger-hint">
            删除会从仓库移除 <code>{path}</code>
            ，GitHub Pages 随后会重新部署，此操作不可撤销。
          </p>
          <div className="danger-controls">
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="GitHub Fine-grained Token（需 Contents: Read and write）"
            />
            <button
              className="danger-confirm"
              onClick={remove}
              disabled={working}
            >
              {working ? "删除中……" : "确认删除"}
            </button>
            <button
              className="secondary-button"
              onClick={() => setOpen(false)}
              disabled={working}
            >
              取消
            </button>
          </div>
          <p className="danger-hint">
            Token 仅用于本次删除，不会保存到任何地方，刷新页面即消失。
          </p>
        </>
      )}
      {status && <p className="status">{status}</p>}
    </section>
  );
}
