import { describe, expect, it } from "vitest";
import {
  parsePost,
  slugFromPath,
  sortByDateDescending,
  toSummary,
  type PostSummary,
} from "./post";

const source = `---
title: 测试文章
description: 一段摘要
date: 2026-10-18
tags: [React, TypeScript]
---

# 正文

内容在这里。
`;

describe("parsePost", () => {
  it("解析 Front Matter 与正文", () => {
    const post = parsePost(source, "test");
    expect(post.slug).toBe("test");
    expect(post.title).toBe("测试文章");
    expect(post.description).toBe("一段摘要");
    expect(post.date).toBe("2026-10-18");
    expect(post.tags).toEqual(["React", "TypeScript"]);
    expect(post.body.startsWith("# 正文")).toBe(true);
    expect(post.body.endsWith("内容在这里。")).toBe(true);
    expect(post.source).toBe(source);
  });

  it("空摘要不会把下一行的日期读成摘要", () => {
    // 写作页写出来的就是 `description: `（值空）这种行，曾经被 `\s*` 吞掉换行
    const post = parsePost(
      "---\ntitle: 标题\ndescription: \ndate: 2026-10-18\ntags: []\n---\n\n正文\n",
      "slug",
    );
    expect(post.description).toBe("");
    expect(post.date).toBe("2026-10-18");
  });

  it("没有 Front Matter 时整篇都是正文", () => {
    const post = parsePost("# 只有正文\n", "plain");
    expect(post.title).toBe("plain");
    expect(post.description).toBe("");
    expect(post.date).toBe("未设置日期");
    expect(post.tags).toEqual([]);
    expect(post.body).toBe("# 只有正文");
  });

  it("标签为空时得到空数组", () => {
    const post = parsePost("---\ntitle: t\ntags: []\n---\n正文", "t");
    expect(post.tags).toEqual([]);
  });
});

describe("toSummary", () => {
  it("只保留列表需要的字段", () => {
    const summary = toSummary(parsePost(source, "test"));
    expect(summary).toEqual({
      slug: "test",
      title: "测试文章",
      description: "一段摘要",
      date: "2026-10-18",
      tags: ["React", "TypeScript"],
    });
    expect("body" in summary).toBe(false);
  });
});

describe("sortByDateDescending", () => {
  const list: PostSummary[] = [
    { slug: "a", title: "a", description: "", date: "2026-01-01", tags: [] },
    { slug: "b", title: "b", description: "", date: "2026-03-01", tags: [] },
    { slug: "c", title: "c", description: "", date: "2026-02-01", tags: [] },
  ];

  it("按日期倒序且不改动入参", () => {
    const sorted = sortByDateDescending(list);
    expect(sorted.map((item) => item.slug)).toEqual(["b", "c", "a"]);
    expect(list.map((item) => item.slug)).toEqual(["a", "b", "c"]);
  });
});

describe("slugFromPath", () => {
  it("从 glob 路径里取出文件名", () => {
    expect(slugFromPath("../content/posts/rag学习.md")).toBe("rag学习");
    expect(slugFromPath("content/posts/a.b.md")).toBe("a.b");
  });
});
