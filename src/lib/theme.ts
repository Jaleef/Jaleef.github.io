/**
 * 主题（浅色 / 深色）
 * ------------------
 * 主题只通过 `<html data-theme>` 影响 CSS 变量，React 不参与任何颜色计算，
 * 因此切换主题不会引起组件重渲染。
 */

export type Theme = "light" | "dark";

const storageKey = "theme";

/** 读取上次选择的主题；偏好不可用时默认浅色。 */
export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(storageKey) === "dark" ? "dark" : "light";
  } catch {
    // 隐私模式下 localStorage 可能不可用
    return "light";
  }
}

/** 把主题写到根元素上，样式表据此切换变量。 */
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
