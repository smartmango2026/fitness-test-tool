import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

window.__FITNESS_TEST_RUNTIME__ = "e2e";
document.documentElement.setAttribute("data-runtime", "e2e");

function renderRuntimeError(error: unknown): void {
  const root = document.getElementById("root");
  if (!root) {
    return;
  }

  const details = error instanceof Error ? error.stack || error.message : String(error);

  root.innerHTML = `
    <section class="boot-error">
      <h1>E2E 測試入口執行失敗</h1>
      <p>前端入口已載入，但 React 啟動過程中發生錯誤，因此無法正常顯示測試環境。</p>
      <pre>${details}</pre>
    </section>
  `;
}

window.addEventListener("error", (event) => {
  renderRuntimeError(event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  renderRuntimeError(event.reason);
});

try {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App runtime="e2e" />
    </React.StrictMode>,
  );
  document.documentElement.setAttribute("data-app-ready", "true");
} catch (error) {
  renderRuntimeError(error);
}
