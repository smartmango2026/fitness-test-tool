import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

function formatRuntimeError(error: unknown): string {
  return error instanceof Error ? error.stack || error.message : String(error);
}

function renderRuntimeError(error: unknown): void {
  const root = document.getElementById("root");
  if (!root) {
    return;
  }

  const details = formatRuntimeError(error);

  root.innerHTML = `
    <section class="boot-error">
      <h1>應用程式執行失敗</h1>
      <p>前端入口已載入，但 React 啟動過程中發生錯誤，因此無法正常顯示內容。</p>
      <p>請先重新整理頁面；如果仍然發生，請把下面訊息截圖給維護者。</p>
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
      <App />
    </React.StrictMode>,
  );
  document.documentElement.setAttribute("data-app-ready", "true");
} catch (error) {
  renderRuntimeError(error);
}
