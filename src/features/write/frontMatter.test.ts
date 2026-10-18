import { describe, expect, it } from "vitest";
import { parsePost } from "../../lib/post";
import { buildMarkdown, parseTags, type PostPayload } from "./frontMatter";

const payload: PostPayload = {
  title: "测试文章",
  description: "一段摘要",
  tags: "React, TypeScript, ",
  body: "# 正文\n\n内容",
  date: "2026-10-18",
};

describe("parseTags", () => {
  it("按逗号拆分并去掉空项", () => {
    expect(parseTags("React, TypeScript, ")).toEqual(["React", "TypeScript"]);
    expect(parseTags("")).toEqual([]);
  });
});

describe("buildMarkdown", () => {
  it("输出与仓库里文章一致的格式", () => {
    expect(buildMarkdown(payload)).toBe(
      "---\ntitle: 测试文章\ndescription: 一段摘要\ndate: 2026-10-18\ntags: [React, TypeScript]\n---\n\n# 正文\n\n内容\n",
    );
  });

  it("标题与正文首尾空白会被裁掉", () => {
    const markdown = buildMarkdown({
      ...payload,
      title: "  标题  ",
      body: "\n\n正文\n\n",
    });
    expect(markdown.startsWith("---\ntitle: 标题\n")).toBe(true);
    expect(markdown.endsWith("\n\n正文\n")).toBe(true);
  });

  it("写出的内容能被 parsePost 原样解析回来（空摘要也不会串行）", () => {
    const markdown = buildMarkdown({ ...payload, description: "", tags: "" });
    const post = parsePost(markdown, "slug");
    expect(post.title).toBe("测试文章");
    expect(post.description).toBe("");
    expect(post.date).toBe("2026-10-18");
    expect(post.tags).toEqual([]);
    expect(post.body).toBe("# 正文\n\n内容");
  });
});
