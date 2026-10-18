import { useEffect, useState } from "react";
import { applyTheme, readStoredTheme, storeTheme, type Theme } from "../lib/theme";

/**
 * 主题状态：初次按本地偏好初始化，切换后写回 localStorage 与 `<html data-theme>`。
 * 首屏的主题由 main.tsx 在渲染前先行应用，这里只负责后续同步，避免深色模式闪白。
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    storeTheme(theme);
  }, [theme]);

  const toggle = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  return { theme, toggle };
}
