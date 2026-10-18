import { describe, expect, it } from "vitest";
import { createSlug, uniqueSlug } from "./slug";

describe("createSlug", () => {
  it("保留中文标题，把空格折叠成连字符", () => {
    expect(createSlug("校园网 为什么 不可达")).toBe("校园网-为什么-不可达");
  });

  it("去掉标点并转小写", () => {
    expect(createSlug("Hello, World! RAG")).toBe("hello-world-rag");
  });

  it("中文全角标点不会留下空 slug", () => {
    expect(createSlug("《重构》")).toBe("重构");
  });

  it("下划线与多余连字符合并", () => {
    expect(createSlug("a__b--c")).toBe("a-b-c");
  });

  it("纯符号得到空字符串", () => {
    expect(createSlug("!!! ???")).toBe("");
  });
});

describe("uniqueSlug", () => {
  it("没有冲突时原样返回", () => {
    expect(uniqueSlug("rag", ["other"])).toBe("rag");
  });

  it("冲突时追加序号", () => {
    expect(uniqueSlug("rag", ["rag"])).toBe("rag-2");
    expect(uniqueSlug("rag", ["rag", "rag-2"])).toBe("rag-3");
  });

  it("空名字退回到时间戳形式", () => {
    expect(uniqueSlug("", [])).toMatch(/^post-\d+$/);
  });
});
