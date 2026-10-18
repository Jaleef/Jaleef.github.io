import { useEffect, useState } from "react";

/**
 * 右下角的「回到顶部 / 跳到底部」控制。
 *
 * 只在页面真的可以滚动时出现；已经到顶或到底时对应按钮置灰。
 * 正文是按需加载的，加载完成后页面高度会变，所以除了 scroll / resize，
 * 还要用 ResizeObserver 监听内容高度，避免按钮状态停留在旧值。
 */

/** 距顶部/底部多少像素内算「到头」。留一点余量，平滑滚动不会正好停在 0 或 max。 */
const edgeThreshold = 16;
const minimumScrollable = 120;

type ScrollState = {
  scrollable: boolean;
  atTop: boolean;
  atBottom: boolean;
};

function readScrollState(): ScrollState {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const y = window.scrollY;
  return {
    scrollable: max > minimumScrollable,
    atTop: y <= edgeThreshold,
    atBottom: y >= max - edgeThreshold,
  };
}

export function ScrollJumper() {
  const [state, setState] = useState<ScrollState>({
    scrollable: false,
    atTop: true,
    atBottom: false,
  });

  useEffect(() => {
    const update = () => setState(readScrollState());
    // 首帧要等布局完成后再读，因此放在 rAF 里
    const frame = window.requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!state.scrollable) return null;

  const jump = (top: number) => {
    // 尊重「减少动态效果」的系统设置
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <div className="scroll-jumper" role="group" aria-label="页面跳转">
      <button
        type="button"
        className="scroll-jumper__button"
        onClick={() => jump(0)}
        disabled={state.atTop}
        aria-label="回到顶部"
        title="回到顶部"
      >
        ↑
      </button>
      <button
        type="button"
        className="scroll-jumper__button"
        onClick={() => jump(document.documentElement.scrollHeight)}
        disabled={state.atBottom}
        aria-label="跳到底部"
        title="跳到底部"
      >
        ↓
      </button>
    </div>
  );
}
