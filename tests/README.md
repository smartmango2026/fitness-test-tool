# 體適能測試專案 (fitness-test-tool) 測試規範指南

隨著專案功能日益龐大，我們將測試案例分為不同的維度和模組，並統一放置於 `tests/` 目錄下。本專案使用 **Playwright** 作為主力的測試框架，並與獨立的泛用工具 `visual-regression-tester` 配合使用。

## 📁 測試目錄結構與分工

### 1. `tests/e2e/` (功能性端對端測試)
此目錄下的測試**不進行**嚴格的像素級截圖比對（Pixel-perfect screenshot diff）。其核心目的是「走通業務流程」，確保各個模組的功能邏輯正常運作。

*   **`smoke.spec.ts`**: 健康度檢查。負責最基本的冒煙測試，例如「網頁能否正常載入」、「登入功能是否正常」。
*   **`main-flow.spec.ts`**: 泛用核心流程。測試系統的骨幹，包含：建立名冊 -> 填寫測驗成績 -> 預覽與產出 PDF 報表。
*   **`friend-system.spec.ts`**: 特定領域測試。測試兩位老師註冊、送出好友邀請與接受好友邀請的基本流程。
*   **`cloud-file.spec.ts` (尚未建立)**: 特定領域測試。未來可專門測試雲端檔案建立、檔案切換、協作共用邏輯等。

### 2. `tests/visual/` (視覺回歸測試)
此目錄存放需要進行嚴格截圖比對的腳本。通常由外部的 `visual-regression-tester` 驅動。
*   重點在於檢查「UI 是否跑版」、「跨裝置 (Mobile/Desktop) 顯示是否正常」。
*   測試過程中的動態資料（如日期、時間、隨機 ID）必須使用 Playwright 的 `mask` 功能遮蔽。
*   注意：一般 E2E 使用 `playwright.config.ts`，視覺回歸使用 `playwright.visual.config.ts`。
*   執行視覺回歸請使用 `pnpm test:visual`，不要用 `pnpm test:e2e tests/visual/`。

### 3. `tests/fixtures/` (測試輔助資料)
存放測試過程中需要的靜態假資料，以確保測試的穩定性與可重複性。
*   例如：`mock-roster.json` (假學生名單)。若未來需要固定測試帳號，必須同時規劃資料清理策略。

---

## 🎯 撰寫與開發規範

1. **唯一識別碼 (`data-testid`) 優先**
   *   所有自動化測試會點擊或檢查的 UI 元素，**絕對不可**依賴中文按鈕文案或容易變動的 CSS Class。
   *   必須在 React 原始碼中加入穩定的 `data-testid`（例如 `data-testid="friend-accept-button"`）。

2. **測試狀態隔離 (Test Isolation)**
   *   不同模組的測試（如好友系統 vs 檔案系統）應盡可能使用不同的測試帳號組合。
   *   或者在每個測試的 `beforeEach` / `afterEach` 階段，落實清理與還原資料的動作，避免互相污染。

3. **等待狀態 (Wait For Stable State)**
   *   在斷言 (Assertion) 或截圖之前，必須確保非同步動作（如 Firebase 資料載入、動畫轉場）已完成。使用 `waitFor()` 或檢測特定的 `data-testid` 是否出現。

4. **與 `visual-regression-tester` 的關係**
   *   本專案只負責提供業務邏輯相關的測試案例與 `data-testid`。
   *   如果需要跑泛用的跨瀏覽器視覺回歸，應切換至 `visual-regression-tester` 工具並將 `VRT_TEST_DIR` 指向本專案的 `tests/visual/`。
