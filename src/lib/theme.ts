/**
 * 主题（GitHub Dark / GitHub Light）
 * ---------------------------------
 * 主题只通过 `<html data-theme>` 影响 CSS 变量，React 不参与任何颜色计算，
 * 因此切换主题不会引起组件重渲染。
 *
 * 默认是 GitHub Dark：CSS 的 `:root` 本身就是深色，只有选了浅色才需要 `data-theme="light"`。
 */

export type Theme = "light" | "dark";

/**
 * 存储键带版本号：默认主题从浅色改成 GitHub Dark 后换一个键，
 * 让老访客也能看到新默认值（旧键里存的只是上一版的自动值，不是用户的选择）。
 */
const storageKey = "blog-theme:v2";

/** 读取上次选择的主题；没选过或读不到时用深色。 */
export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(storageKey) === "light" ? "light" : "dark";
  } catch {
    // 隐私模式下 localStorage 可能不可用
    return "dark";
  }
}

/** 把主题写到根元素上，样式表据此切换变量（深色是默认值，无需额外规则）。 */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** 记住用户的选择，下次打开仍是他偏好的主题。 */
export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(storageKey, theme);
  } catch {
    // 存不下就算了，不影响本次浏览
  }
}
