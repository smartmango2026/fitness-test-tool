import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

function renderRuntimeError(error: unknown): void {
  const root = document.getElementById("root");
  if (!root) {
    return;
  }

  const details = error instanceof Error ? error.stack || error.message : String(error);

  root.innerHTML = `
    <section class="boot-error">
      <h1>實驗版頁面執行失敗</h1>
      <p>前端入口已載入，但 React 啟動過程中發生錯誤，因此無法正常顯示實驗版頁面。</p>
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
      <App experimentalMode />
    </React.StrictMode>,
  );
  document.documentElement.setAttribute("data-app-ready", "true");
} catch (error) {
  renderRuntimeError(error);
}
