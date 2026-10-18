import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyTheme, readStoredTheme } from "./lib/theme";
import "./styles/index.css";
import App from "./App.tsx";

// 首屏渲染前先落主题，避免深色模式闪一下白
applyTheme(readStoredTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
