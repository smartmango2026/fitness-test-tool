import React from "react";
import ReactDOM from "react-dom/client";
import DebugPage from "./features/debug/DebugPage";
import "./styles.css";

function renderRuntimeError(error: unknown): void {
  const root = document.getElementById("root");
  if (!root) {
    return;
  }

  const details =
    error instanceof Error ? error.stack || error.message : String(error);

  root.innerHTML = `
    <section class="boot-error">
      <h1>Debug 頁執行失敗</h1>
      <p>前端入口已載入，但 React 啟動過程中發生錯誤，因此無法正常顯示除錯頁。</p>
      <pre>${details}</pre>
    </section>
  `;
}

try {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <DebugPage />
    </React.StrictMode>,
  );
  document.documentElement.setAttribute("data-app-ready", "true");
} catch (error) {
  renderRuntimeError(error);
}
