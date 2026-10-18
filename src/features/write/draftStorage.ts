/**
 * 草稿的本地暂存
 * --------------
 * 写作页的内容只存在内存里，刷新或误关标签页就会丢。这里把它按「文章身份」
 * 暂存到 localStorage：只在本机、不上传，发布成功后清除。
 *
 * 存储键带版本号：以后草稿结构变化时，旧数据会被自然忽略而不是解析出错。
 */

export type DraftSnapshot = {
  title: string;
  slugInput: string;
  slugEdited: boolean;
  description: string;
  tags: string;
  body: string;
  /** 保存时间戳（毫秒） */
  savedAt: number;
};

/** 参与「是否有改动」比较的字段（不含保存时间）。 */
export type DraftContent = Omit<DraftSnapshot, "savedAt">;

const keyPrefix = "blog-draft:v1:";

function storageKey(scope: string): string {
  return `${keyPrefix}${scope}`;
}

/** 读取某个草稿；数据缺失或损坏时返回 null。 */
export function readDraft(scope: string): DraftSnapshot | null {
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DraftSnapshot>;
    if (typeof parsed.title !== "string" || typeof parsed.body !== "string")
      return null;
    return {
      title: parsed.title,
      slugInput: typeof parsed.slugInput === "string" ? parsed.slugInput : "",
      slugEdited: Boolean(parsed.slugEdited),
      description:
        typeof parsed.description === "string" ? parsed.description : "",
      tags: typeof parsed.tags === "string" ? parsed.tags : "",
      body: parsed.body,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    };
  } catch {
    // 隐私模式 / 数据被手动改坏：当作没有草稿
    return null;
  }
}

/** 写入草稿；返回是否成功（容量不足等情况下会失败）。 */
export function writeDraft(
  scope: string,
  draft: DraftSnapshot,
): boolean {
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

/** 清除某个草稿。 */
export function clearDraft(scope: string): void {
  try {
    localStorage.removeItem(storageKey(scope));
  } catch {
    // 清不掉也不影响当前编辑
  }
}

/** 两份草稿内容是否一致（用于判断「有没有真实改动」）。 */
export function isSameDraft(a: DraftContent, b: DraftContent): boolean {
  return (
    a.title === b.title &&
    a.slugInput === b.slugInput &&
    a.slugEdited === b.slugEdited &&
    a.description === b.description &&
    a.tags === b.tags &&
    a.body === b.body
  );
}

/** 把时间戳格式化成 `14:32`，用于提示「什么时间保存的」。 */
export function formatClock(timestamp: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
