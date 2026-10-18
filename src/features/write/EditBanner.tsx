type EditBannerProps = {
  originalSlug: string;
  resolvedSlug: string;
  slugChanged: boolean;
  date: string;
};

/** 编辑模式提示：明确当前在改哪一篇、文件名会不会变、日期会怎么变。 */
export function EditBanner({
  originalSlug,
  resolvedSlug,
  slugChanged,
  date,
}: EditBannerProps) {
  return (
    <p className="edit-banner">
      正在编辑 <code>{originalSlug}.md</code>
      {slugChanged ? (
        <span>
          {" "}
          · 文件名将改为 <code>{resolvedSlug}.md</code>，发布后会移除旧文件
        </span>
      ) : (
        <span> · 发布日期将更新为 {date}</span>
      )}
    </p>
  );
}
