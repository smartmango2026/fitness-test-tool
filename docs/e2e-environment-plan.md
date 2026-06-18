# E2E 測試環境隔離計畫

```yaml
document_purpose: "for future sessions / agents"
project: "fitness-test-tool"
decision_status: "planned, not implemented"
created_from_session_summary: true
priority: "high before automated E2E writes production-like data"
```

## 核心決策

短期需要一套可行的 E2E 測試，驗證註冊、好友、建檔、分享、名冊、成績與 PDF 報表。

同時，測試資料不能污染正式老師資料。因此決策是：

```text
同一個 repo
同一套 app code
保留正式入口 /
新增測試入口 /e2e/
/e2e/ 使用獨立 Firebase test project
不複製兩份長期分叉的頁面程式碼
```

這不是要建立另一個正式產品頁，而是為自動化測試與人工測試提供隔離入口。

## 目前盤點

專案已經有多入口結構：

```text
index.html
lab/index.html
debug/index.html
src/main.tsx
src/lab-main.tsx
src/debug-main.tsx
vite.config.ts
```

`vite.config.ts` 目前已支援多 entry build：

```text
main
debug
lab
```

Firebase 目前仍在 `src/firebase.ts` 硬編碼正式 project：

```text
projectId: fitness-test-tool-42789
```

`src/firebase-test.ts` 只是連線測試 helper，仍 import `db` from `./firebase`，不是獨立測試 Firebase 設定。

## 目標架構

新增：

```text
e2e/index.html
src/e2e-main.tsx
src/firebase-config.ts
```

調整：

```text
src/firebase.ts
vite.config.ts
```

預期入口：

| 入口 | URL | 用途 | Firebase |
| --- | --- | --- | --- |
| 正式 | `/` | 真實老師使用 | 正式 project |
| Lab | `/lab/` | UI/功能實驗 | 預設正式，除非另行調整 |
| Debug | `/debug/` | 規則/除錯工具 | 預設正式，除非另行調整 |
| E2E | `/e2e/` | 自動化測試與隔離測試 | 測試 project |

## Firebase 設定抽象

建議建立 `src/firebase-config.ts`。

第一版可採用 build-time / entry-time 判斷：

```ts
export type FirebaseRuntime = "production" | "e2e";

export function resolveFirebaseConfig(runtime: FirebaseRuntime) {
  if (runtime === "e2e") {
    return e2eFirebaseConfig;
  }
  return productionFirebaseConfig;
}
```

`src/main.tsx` 設定正式 runtime：

```ts
window.__FITNESS_TEST_RUNTIME__ = "production";
```

`src/e2e-main.tsx` 設定測試 runtime：

```ts
window.__FITNESS_TEST_RUNTIME__ = "e2e";
```

`src/firebase.ts` 只負責讀 runtime 並初始化：

```ts
const runtime = getFitnessRuntime();
const firebaseConfig = resolveFirebaseConfig(runtime);
export const firebaseApp = initializeApp(firebaseConfig);
```

實作時要避免同一個 Firebase app name 被重複初始化。必要時可使用具名 app：

```ts
initializeApp(firebaseConfig, runtime)
```

或檢查 `getApps()`。

## E2E 入口 UI 識別

`/e2e/` 必須明顯顯示自己是測試環境，避免人類誤用。

建議：

```text
頁首顯示「E2E 測試環境」
body 或 html 加 data-runtime="e2e"
主視覺使用不同邊框/提示色
登入區顯示「此頁連線至測試 Firebase，不會寫入正式資料」
```

測試也應 assert：

```text
data-runtime="e2e"
畫面上有 E2E 測試環境提示
```

這是防止測試腳本跑到正式入口的重要 guardrail。

## 防混用 Guardrails

### App 層

- `/e2e/` 啟動時必須使用測試 Firebase config。
- `/` 啟動時必須使用正式 Firebase config。
- 在 UI 明顯標示 runtime。
- 測試入口不應共用正式 localStorage key，避免「上次開啟檔案」互相污染。

建議 localStorage key 加 runtime suffix：

```text
fitness-tool:lastCloudFileId:production
fitness-tool:lastCloudFileId:e2e
```

若目前 localStorage key 分散在多處，第一版至少要處理會影響「登入 A 後登出再登入 B 仍看到舊檔案」的關鍵 key。

### Playwright 層

測試開始前先確認：

```text
URL 包含 /e2e/
頁面 runtime 是 e2e
Firebase project id 是 test project
```

若任一條件不成立，測試必須停止。

### Firebase 層

測試 Firebase project 應與正式 project 分開。

測試帳號前綴：

```text
e2e_teacher_a_
e2e_teacher_b_
```

測試檔案前綴：

```text
E2E 測試班級
```

未來建立清理腳本，只清理上述前綴。

## 尚未完成

目前尚未完成：

```text
未建立 Firebase test project
未取得 test Firebase config
本機未安裝 firebase CLI
未新增 /e2e/ entry
未抽出 firebase-config.ts
未修改 localStorage runtime key
未把 visual-regression-tester 接到 /e2e/
未把 Playwright 測試搬到 fitness-test-tool/tests/visual
```

## 建議工作順序

### Step 1: 抽出 Firebase 設定

建立：

```text
src/firebase-config.ts
```

將正式 config 從 `src/firebase.ts` 移出。

保留正式行為不變。

驗證：

```powershell
pnpm build
pnpm dev
```

### Step 2: 新增 /e2e/ 入口

建立：

```text
e2e/index.html
src/e2e-main.tsx
```

更新：

```text
vite.config.ts
```

先可暫時使用正式 Firebase config，但 UI 必須顯示 e2e runtime。正式接 test Firebase 前，不要讓自動化測試寫入。

驗證：

```text
http://localhost:5173/e2e/
```

### Step 3: 建立 Firebase test project

需要在 Firebase Console 建立獨立 project。

取得 Web app config 後填入 `src/firebase-config.ts`。

注意：Firebase config 可公開，但安全性要靠 Firebase Auth / Firestore Rules，而不是靠隱藏 config。

### Step 4: 讓 /e2e/ 連 test Firebase

`e2e-main.tsx` 設 runtime 為 `e2e`。

`firebase.ts` 依 runtime 選 test config。

驗證：

```text
/e2e/ 顯示 test project id
/`/` 仍顯示 production project id 或不顯示但實際連正式 project
```

### Step 5: 接 visual-regression-tester

`visual-regression-tester` 短期用固定 Playwright `.spec.ts`，baseURL 指向：

```text
http://localhost:5173/e2e/
```

先不要做 JSON script runner。

### Step 6: 補 data-testid

依 `docs/e2e-visual-test-plan.md` 的清單，逐步補穩定 selector。

第一批至少補：

```text
auth-register-button
auth-username-input
auth-password-input
auth-submit-button
account-tab
files-tab
roster-tab
metric-tab
summary-tab
pdf-tab
create-file-button
current-file-card
roster-sheet
roster-save-button
metric-sheet
metric-save-button
summary-sheet
pdf-report-preview
pdf-download-all-button
```

## 驗收標準

完成 `/e2e/` 測試入口後，必須符合：

- `/` 仍可正常使用正式資料。
- `/e2e/` 可正常載入同一套 App。
- `/e2e/` UI 明確標示測試環境。
- `/e2e/` 使用測試 Firebase project。
- 測試登入、建檔、分享、輸入資料不會出現在正式 project。
- Playwright 測試啟動前可 assert 目前是 e2e runtime。

## 高風險注意事項

- 不要複製一份 App 長期維護。
- 不要讓 `/e2e/` 和 `/` 共用會造成檔案自動還原的 localStorage key。
- 不要在還沒接 test Firebase 前，讓自動化測試大量寫入正式 Firebase。
- 不要把 test project 的管理權限和正式 project 混在一起。
- 不要把 Firebase admin/service account key 放進前端或 Git。

## 與其他文件關係

- `docs/e2e-visual-test-plan.md`：描述完整 E2E 操作路徑與截圖策略。
- 本文件：描述如何隔離 E2E 測試環境，避免測試資料污染正式資料。
- `D:\VSCode\visual-regression-tester\SESSION_CONTEXT.md`：描述測試模組短期與長期策略。

