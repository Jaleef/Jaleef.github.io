import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { parsePost, slugFromPath, toSummary } from "../src/lib/post.ts";

const virtualId = "virtual:posts-index";
const resolvedId = `\0${virtualId}`;

/**
 * 构建期生成文章索引
 * ------------------
 * 首页只需要标题 / 摘要 / 日期 / 标签，正文却是几百 KB 的 Markdown。
 * 这里在构建期把每篇文章解析成 `PostSummary`，通过虚拟模块交给前端；
 * 正文仍由 `import.meta.glob` 按需动态导入，因此首页首屏不含任何正文。
 *
 * 解析规则复用 `src/lib/post.ts`，与运行时保持一致。
 */
export function postsIndexPlugin(): Plugin {
  const directory = join(process.cwd(), "content/posts");

  const listFiles = () => {
    try {
      return readdirSync(directory).filter((name) => name.endsWith(".md"));
    } catch {
      // 目录还不存在（例如刚克隆的空仓库）时不应让构建崩溃
      return [];
    }
  };

  return {
    name: "blog:posts-index",

    buildStart() {
      // 新增/删除文章也要触发重新构建
      this.addWatchFile(directory);
      for (const file of listFiles()) this.addWatchFile(join(directory, file));
    },

    resolveId(id) {
      return id === virtualId ? resolvedId : null;
    },

    load(id) {
      if (id !== resolvedId) return null;
      const summary = listFiles().map((file) => {
        const source = readFileSync(join(directory, file), "utf8");
        return toSummary(parsePost(source, slugFromPath(file)));
      });
      return `export default ${JSON.stringify(summary)};`;
    },
  };
}
