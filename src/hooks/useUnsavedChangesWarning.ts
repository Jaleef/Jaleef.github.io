import { useEffect } from "react";

/**
 * 有未保存内容时提示浏览器「确定要离开吗」。
 * 只在真正改过内容后启用，避免正常浏览时也被拦。
 */
export function useUnsavedChangesWarning(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // 部分浏览器仍需要给 returnValue 赋值才会弹确认框
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [enabled]);
}
