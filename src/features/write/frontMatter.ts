/**
 * 写作表单与 Front Matter
 * -----------------------
 * 保存下来的文章格式必须与 content/posts/*.md 完全一致，
 * 否则构建时的解析（lib/post.ts）读不出标题与日期。
 */

export type PostPayload = {
  title: string;
  description: string;
  /** 逗号分隔的标签原文，例如 `React, TypeScript` */
  tags: string;
  body: string;
  /** 写入 Front Matter 的日期，格式 `YYYY-MM-DD` */
  date: string;
};

/** 把「逗号分隔」的输入拆成标签数组，空项会被丢弃。 */
export function parseTags(tags: string): string[] {
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** 按当前表单内容拼出完整 Markdown（含 Front Matter）。 */
export function buildMarkdown(payload: PostPayload): string {
  const tags = parseTags(payload.tags).join(", ");
  return `---\ntitle: ${payload.title.trim()}\ndescription: ${payload.description.trim()}\ndate: ${payload.date}\ntags: [${tags}]\n---\n\n${payload.body.trim()}\n`;
}
