import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isInPlaceUpdate,
  overwritePost,
  publishPost,
  saveAsNewPost,
  type PublishRequest,
} from "./publishPost";

const github = vi.hoisted(() => ({
  getFileSha: vi.fn(),
  listPostSlugs: vi.fn(),
  putPost: vi.fn(),
  deletePost: vi.fn(),
}));

vi.mock("../../lib/github", () => github);

const baseRequest: PublishRequest = {
  title: "测试文章",
  description: "",
  tags: "React",
  body: "正文",
  date: "2026-10-18",
  originalSlug: "",
  preferredSlug: "测试文章",
  previewSlug: "测试文章",
  localSlugs: new Set<string>(),
};

beforeEach(() => {
  vi.clearAllMocks();
  github.listPostSlugs.mockResolvedValue([]);
  github.getFileSha.mockResolvedValue(null);
  github.putPost.mockResolvedValue(undefined);
  github.deletePost.mockResolvedValue(undefined);
});

describe("publishPost 新建", () => {
  it("文件名未被占用时直接写入，提交信息用 post:", async () => {
    const report = vi.fn();
    const result = await publishPost(baseRequest, "token", report);

    expect(github.putPost).toHaveBeenCalledTimes(1);
    const [call] = github.putPost.mock.calls[0];
    expect(call.slug).toBe("测试文章");
    expect(call.sha).toBeUndefined();
    expect(call.message).toBe("post: 测试文章");
    expect(call.markdown).toContain("title: 测试文章");
    expect(report).toHaveBeenCalledWith("正在发布……");
    expect(result).toEqual({
      type: "published",
      slug: "测试文章",
      mode: "created",
    });
  });

  it("仓库里已有同名文件时返回冲突，并给出不冲突的备选名", async () => {
    // 真实场景下仓库列表里也能看到这个文件，备选名据此避开它
    github.listPostSlugs.mockResolvedValue(["测试文章"]);
    github.getFileSha.mockResolvedValue("sha-1");
    const result = await publishPost(baseRequest, "token", vi.fn());

    expect(result).toEqual({
      type: "conflict",
      slug: "测试文章",
      sha: "sha-1",
      alternative: "测试文章-2",
    });
    expect(github.putPost).not.toHaveBeenCalled();
  });

  it("候选名被本地构建产物占用时自动改名", async () => {
    const request = { ...baseRequest, localSlugs: new Set(["测试文章"]) };
    const result = await publishPost(request, "token", vi.fn());

    expect(github.putPost.mock.calls[0][0].slug).toBe("测试文章-2");
    expect(result).toMatchObject({ type: "published", slug: "测试文章-2" });
    expect(github.getFileSha).toHaveBeenCalledWith("测试文章-2", "token");
  });
});

describe("publishPost 原地更新", () => {
  const request: PublishRequest = {
    ...baseRequest,
    originalSlug: "old",
    preferredSlug: "old",
    previewSlug: "old",
  };

  it("文件名没变时带上 sha 覆盖原文件，日期用今天的", async () => {
    github.getFileSha.mockResolvedValue("sha-old");
    const result = await publishPost(request, "token", vi.fn());

    const [call] = github.putPost.mock.calls[0];
    expect(call.slug).toBe("old");
    expect(call.sha).toBe("sha-old");
    expect(call.message).toBe("update: 测试文章");
    expect(call.markdown).toContain("date: 2026-10-18");
    expect(result).toEqual({ type: "published", slug: "old", mode: "updated" });
  });

  it("仓库里已找不到该文件时返回 missing", async () => {
    github.getFileSha.mockResolvedValue(null);
    const result = await publishPost(request, "token", vi.fn());

    expect(result).toEqual({ type: "missing", slug: "old" });
    expect(github.putPost).not.toHaveBeenCalled();
  });
});

describe("publishPost 改名", () => {
  const request: PublishRequest = {
    ...baseRequest,
    originalSlug: "old",
    preferredSlug: "new-name",
    previewSlug: "new-name",
  };

  it("写新文件后删除旧文件并给出提示", async () => {
    const result = await publishPost(request, "token", vi.fn());

    expect(github.putPost.mock.calls[0][0].slug).toBe("new-name");
    expect(github.deletePost).toHaveBeenCalledWith({
      slug: "old",
      token: "token",
      message: "chore: 重命名前移除旧文件 old.md",
    });
    expect(result).toMatchObject({
      type: "published",
      slug: "new-name",
      mode: "renamed",
      note: "旧的 old.md 已移除。",
    });
  });

  it("旧文件删不掉时仍在提示里说明", async () => {
    github.deletePost.mockRejectedValue(new Error("boom"));
    const result = await publishPost(request, "token", vi.fn());

    expect(result).toMatchObject({
      note: "注意：旧的 old.md 删除失败，请手动处理。",
    });
  });

  it("旧文件名不会被当成冲突（自己不算占用）", async () => {
    github.listPostSlugs.mockResolvedValue(["old"]);
    const result = await publishPost(request, "token", vi.fn());
    expect(result).toMatchObject({ type: "published", slug: "new-name" });
  });
});

describe("冲突的两种处理", () => {
  it("更新原文会重新取一次 sha", async () => {
    github.getFileSha.mockResolvedValue("sha-fresh");
    const result = await overwritePost(baseRequest, { slug: "测试文章" }, "token");

    expect(github.putPost.mock.calls[0][0].sha).toBe("sha-fresh");
    expect(result).toEqual({
      type: "published",
      slug: "测试文章",
      mode: "updated",
    });
  });

  it("原文已不存在时返回 missing", async () => {
    github.getFileSha.mockResolvedValue(null);
    const result = await overwritePost(baseRequest, { slug: "测试文章" }, "token");
    expect(result).toEqual({ type: "missing", slug: "测试文章" });
  });

  it("另存为新文章时若备选名也被占用则返回 taken", async () => {
    github.getFileSha.mockResolvedValue("sha-other");
    const result = await saveAsNewPost(baseRequest, "测试文章-2", "token");
    expect(result).toEqual({ type: "taken", slug: "测试文章-2" });
    expect(github.putPost).not.toHaveBeenCalled();
  });

  it("另存为新文章会写入新文件名", async () => {
    const result = await saveAsNewPost(baseRequest, "测试文章-2", "token");
    expect(github.putPost.mock.calls[0][0].slug).toBe("测试文章-2");
    expect(result).toEqual({
      type: "published",
      slug: "测试文章-2",
      mode: "renamed",
    });
  });
});

describe("isInPlaceUpdate", () => {
  it("编辑既有文章且文件名未变时为 true", () => {
    expect(
      isInPlaceUpdate({ ...baseRequest, originalSlug: "a", previewSlug: "a" }),
    ).toBe(true);
    expect(
      isInPlaceUpdate({ ...baseRequest, originalSlug: "a", previewSlug: "b" }),
    ).toBe(false);
    expect(isInPlaceUpdate({ ...baseRequest, originalSlug: "" })).toBe(false);
  });
});
