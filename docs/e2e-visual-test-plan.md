# 體適能測驗網站 E2E 視覺測試計畫

本文件規劃 `fitness-test-tool` 的初步完整操作路徑測試。目標不是一次建立所有測試，而是先定義一條最有代表性的「老師實際使用流程」，之後讓 `visual-regression-tester` 依照腳本逐步執行、留存截圖、比對報表，並記錄每次測試環境。

## 測試定位

這份測試計畫屬於 `fitness-test-tool`，不屬於 `visual-regression-tester`。

分工如下：

- `fitness-test-tool` 提供測試腳本、測試資料、測試帳號策略、Firebase 測試環境與業務驗收規則。
- `visual-regression-tester` 只負責讀取腳本、操作瀏覽器、截圖、比對、輸出報告。

因此，測試腳本與 fixtures 未來應放在本專案，例如：

```text
tests/visual/
  full-teacher-workflow.vrt.json
  fixtures/
    class-file.json
    roster.json
    scores.json
  baselines/
  reports/
```

## 第一版測試目標

第一版只做一條完整 happy path：

```text
註冊老師 A
註冊老師 B
老師 A 加老師 B 為好友
老師 A 建立檔案
老師 A 分享檔案給老師 B
老師 B 開啟共享檔案
老師 B 編輯學員名冊
老師 A 或 B 輸入測驗成績
產生並下載全班報表 PDF
留存關鍵畫面截圖
比對最後報表畫面或 PDF/PNG 輸出
```

這條路徑會覆蓋目前最高風險的功能區：

- 帳號與註冊
- 好友邀請
- 雲端檔案建立
- 檔案分享與切換
- 共享檔案資料一致性
- 學員名冊 spreadsheet 操作
- 測驗項目或總表成績輸入
- PDF 報表生成
- 桌機與手機版主要版面

## 測試環境原則

第一版可先在本機執行，但不應長期使用正式 Firebase 資料庫。

建議環境分級：

| 環境 | 用途 | Firebase | 可否寫入 |
| --- | --- | --- | --- |
| local-dev | 開發者本機手動驗證 | 可暫用正式或測試 | 小心 |
| test-cloud | 自動化 E2E | 測試 Firebase project | 可以 |
| production | 真實老師使用 | 正式 Firebase project | 不跑自動化寫入測試 |

測試帳號命名必須可辨識：

```text
e2e_teacher_a_<timestamp>
e2e_teacher_b_<timestamp>
```

測試檔案命名必須可辨識：

```text
E2E 測試班級 <timestamp>
```

未來要補清理腳本，定期清理：

- Firebase Auth 測試帳號
- Firestore 測試使用者資料
- 測試班級檔案
- 好友邀請與分享索引

## 測試資料

第一版使用小資料集，避免測試太慢。

建議班級：

```json
{
  "academicTerm": "114學年度下學期",
  "rosterName": "E2E 星星班",
  "gradeLabel": "大班",
  "testDate": "2026-04-22"
}
```

建議名冊：

```json
[
  { "seatNo": 1, "studentName": "測試小一", "height": 108, "weight": 18 },
  { "seatNo": 2, "studentName": "測試小二", "height": 112, "weight": 20 },
  { "seatNo": 3, "studentName": "測試小三", "height": 116, "weight": 21 }
]
```

建議成績：

```json
[
  { "studentName": "測試小一", "item1": 4, "item2": 3, "item3": 4, "item4": 5, "item5": 3, "item6": 2 },
  { "studentName": "測試小二", "item1": 3, "item2": 4, "item3": 3, "item4": 4, "item5": 4, "item6": 3 },
  { "studentName": "測試小三", "item1": 5, "item2": 5, "item3": 4, "item4": 5, "item5": 4, "item6": 4 }
]
```

## 完整操作路徑

### 0. 啟動與環境記錄

動作：

- 開啟測試網站。
- 記錄 base URL。
- 記錄瀏覽器、viewport、device profile。
- 記錄 app git branch 與 commit。
- 記錄測試腳本 hash。

截圖：

- `00-start-page`

驗收：

- 頁面可載入。
- 沒有啟動畫面錯誤。
- 測試環境 metadata 正確寫入測試報告。

### 1. 註冊老師 A

動作：

- 按下「註冊」。
- 輸入老師 A 帳號。
- 輸入密碼。
- 送出註冊。
- 等待登入狀態顯示老師 A。

截圖：

- `01-register-a-form`
- `02-register-a-success`

遮罩：

- 隨機帳號後綴。
- 任何時間戳或 UID。

驗收：

- 註冊成功。
- 頁首顯示已登入。
- 帳號管理區可進入。

### 2. 註冊老師 B

動作：

- 在第二個 browser context 開啟網站。
- 註冊老師 B。
- 等待登入狀態顯示老師 B。

截圖：

- `03-register-b-success`

驗收：

- 老師 A 與老師 B 在不同 browser context 中各自登入。
- 兩邊登入狀態不互相污染。

### 3. 老師 A 加老師 B 為好友

動作：

- 老師 A 進入帳號或好友管理區。
- 輸入老師 B 帳號。
- 送出好友邀請。
- 老師 B 查看收到的邀請。
- 老師 B 接受邀請。
- 老師 A 確認好友列表出現老師 B。

截圖：

- `04-friend-request-sent`
- `05-friend-request-received`
- `06-friend-accepted`

驗收：

- 邀請狀態正確。
- 接受後雙方好友列表同步。
- 沒有殘留錯誤提示。

### 4. 老師 A 建立檔案

動作：

- 老師 A 進入「編輯檔案」。
- 開啟建立新檔案表單。
- 輸入學期、班級名稱、班級類型、測驗日期、班級人數。
- 送出建立。
- 等待目前檔案切換到新檔案。

截圖：

- `07-create-file-form`
- `08-create-file-success`

遮罩：

- 隨機時間戳。
- 檔案 ID。

驗收：

- 建檔成功。
- 目前檔案名稱正確。
- 沒有顯示「尚未選擇檔案」。

### 5. 老師 A 分享檔案給老師 B

動作：

- 老師 A 在檔案管理區選擇老師 B。
- 按下分享。
- 等待分享狀態完成。
- 老師 B 進入檔案管理區。
- 老師 B 選取或切換到共享檔案。

截圖：

- `09-share-file-form`
- `10-share-file-success-owner`
- `11-shared-file-visible-recipient`

驗收：

- 老師 B 可看到共享檔案。
- 老師 B 開啟的檔案名稱與老師 A 建立的檔案一致。
- 老師 B 不是看到自己舊檔案或範例資料。

### 6. 老師 B 編輯學員名冊

動作：

- 老師 B 進入「學員名單」。
- 使用 spreadsheet 操作輸入姓名、身高、體重。
- 可用貼上多列資料或逐格輸入。
- 按下「儲存」。
- 等待儲存完成。

截圖：

- `12-roster-empty`
- `13-roster-filled-before-save`
- `14-roster-saved`

遮罩：

- 儲存時間或動態提示。

驗收：

- 名冊資料顯示正確。
- 按 Enter 可移動到下一列。
- 方向鍵可移動儲存格。
- 儲存後 dirty 狀態清除。

### 7. 老師 A 驗證共享資料同步

動作：

- 老師 A 重新整理頁面或切換回共享檔案。
- 進入「學員名單」。
- 確認老師 B 輸入的名冊存在。

截圖：

- `15-roster-sync-owner`

驗收：

- 老師 A 可看到老師 B 儲存的名冊。
- 不需要手動重新建立資料。

### 8. 輸入測驗成績

第一版建議使用「測驗項目」頁面逐項輸入，因為它代表老師批次輸入一個項目的主要情境。

動作：

- 進入「測驗項目」。
- 選擇第 1 個測驗項目。
- 輸入三位學生分數。
- 按下「儲存」。
- 切換到第 2 個測驗項目。
- 重複輸入直到六項完成。

截圖：

- `16-metric-item1-before-save`
- `17-metric-item1-saved`
- `18-metric-item6-complete`

驗收：

- 每個項目分數可輸入。
- 儲存按鈕在資料下方。
- 儲存後切換項目資料不消失。

第二版可補「檢視總表」一次輸入多欄位的測試。

### 9. 檢視總表

動作：

- 進入「檢視總表」。
- 確認三位學生與六項成績。
- 切換「只顯示未完成」。
- 確認全部完成時不顯示未完成學生。

截圖：

- `19-summary-table-complete`
- `20-summary-table-incomplete-filter`

驗收：

- 總表資料與前一步輸入一致。
- 評語不顯示在總表。
- 刪除按鈕不顯示。
- 完成篩選邏輯正確。

### 10. 下載報表

動作：

- 進入「下載 PDF」。
- 選擇第一位學生。
- 確認 A4 報表預覽。
- 下載全班 PDF。
- 如果工具可取得下載檔，保留 PDF 或轉成圖片比對。

截圖：

- `21-report-student-1-preview`
- `22-report-student-2-preview`
- `23-report-student-3-preview`

可比對產物：

- 每位學生報表預覽截圖。
- 下載後 PDF。
- PDF 轉 PNG 的第一頁或每一頁。

驗收：

- 學生下拉選單可切換。
- 三位學生報表內容不同且正確。
- 全班 PDF 是單一檔案。
- 每位學生各自佔一頁。
- 雷達圖與六項摘要正常。

## 截圖策略

截圖分三類：

| 類型 | 用途 | 是否做 baseline 比對 |
| --- | --- | --- |
| 流程證據截圖 | 確認測試走到該步 | 可選 |
| UI 回歸截圖 | 檢查主要版面是否跑版 | 是 |
| 報表截圖 | 檢查最終輸出 | 是 |

第一版建議只對以下截圖做嚴格比對：

- `08-create-file-success`
- `14-roster-saved`
- `19-summary-table-complete`
- `21-report-student-1-preview`
- PDF 轉圖後的報表頁面

其他步驟先保存截圖，不強制比對，避免初期維護成本太高。

## 遮罩策略

下列內容容易變動，截圖比對時應遮罩：

- 測試帳號隨機後綴
- UID
- fileId
- browser record ID
- 時間戳
- 最近事件 log
- 儲存成功時間
- Firebase 產生的內部 ID
- QR code 或 invite token

不應遮罩：

- 頁面主要布局
- 表格欄位
- 學生姓名欄位
- 測驗分數
- 報表標題
- 雷達圖與摘要表

## 腳本結構草案

未來 `visual-regression-tester` 腳本可像這樣描述：

```json
{
  "name": "fitness full teacher workflow",
  "baseUrl": "http://localhost:5173",
  "metadata": {
    "targetProject": "fitness-test-tool",
    "scenario": "register-friend-share-score-report"
  },
  "fixtures": {
    "classFile": "./fixtures/class-file.json",
    "roster": "./fixtures/roster.json",
    "scores": "./fixtures/scores.json"
  },
  "contexts": ["teacherA", "teacherB"],
  "steps": [
    { "action": "run", "name": "registerTeacher", "context": "teacherA" },
    { "action": "run", "name": "registerTeacher", "context": "teacherB" },
    { "action": "run", "name": "addFriend", "context": "teacherA" },
    { "action": "run", "name": "createClassFile", "context": "teacherA" },
    { "action": "run", "name": "shareFile", "context": "teacherA" },
    { "action": "run", "name": "openSharedFile", "context": "teacherB" },
    { "action": "run", "name": "editRoster", "context": "teacherB" },
    { "action": "run", "name": "verifyRosterSync", "context": "teacherA" },
    { "action": "run", "name": "enterScores", "context": "teacherA" },
    { "action": "run", "name": "downloadReports", "context": "teacherA" }
  ]
}
```

## 必要的 data-testid

為了避免測試依賴中文文案或版面位置，建議逐步補上：

```text
auth-login-button
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
friend-target-input
friend-send-button
friend-accept-button
create-file-button
create-file-form
file-name-input
file-grade-select
file-test-date-input
file-size-input
file-create-submit
file-share-select
file-share-submit
current-file-card
roster-sheet
roster-save-button
metric-item-select
metric-sheet
metric-save-button
summary-sheet
summary-incomplete-filter
pdf-student-select
pdf-report-preview
pdf-download-all-button
```

## 測試結果紀錄

每次測試應至少記錄：

```json
{
  "runId": "timestamp-or-uuid",
  "targetProject": "fitness-test-tool",
  "targetUrl": "http://localhost:5173",
  "appBranch": "main",
  "appCommit": "git sha",
  "scriptName": "fitness full teacher workflow",
  "scriptHash": "hash",
  "browser": "chromium",
  "deviceProfile": "desktop",
  "viewport": "1280x800",
  "startedAt": "ISO timestamp",
  "endedAt": "ISO timestamp",
  "status": "passed | failed",
  "createdUsers": ["e2e_teacher_a_xxx", "e2e_teacher_b_xxx"],
  "createdFiles": ["E2E 星星班 xxx"],
  "artifacts": {
    "screenshots": [],
    "pdf": [],
    "logs": []
  }
}
```

## 第一版驗收標準

第一版測試可視為通過，必須符合：

- 老師 A 與老師 B 都能註冊並登入。
- 老師 A 可成功加老師 B 為好友。
- 老師 A 可建立新檔案。
- 老師 A 可分享檔案給老師 B。
- 老師 B 可開啟共享檔案，不會看到錯誤檔案或範例資料。
- 老師 B 可輸入並儲存學員名冊。
- 老師 A 可看到老師 B 儲存的名冊。
- 成績可輸入並儲存。
- 總表顯示正確。
- PDF 預覽可產生。
- 全班 PDF 可下載。
- 至少保留主要關卡截圖。
- 最終報表畫面可做 baseline 比對。

## 暫不納入第一版

以下功能先不放入第一版，避免測試腳本過大：

- QR code 好友邀請流程。
- 問題回報與截圖上傳。
- Cloudinary 圖片上傳驗證。
- Excel 匯入匯出。
- 混齡班不同年級規則。
- 手機版完整資料輸入。
- 條件分支與影像判斷。
- 測試資料自動清理。

這些可在完整 happy path 穩定後逐項加入。

## 與重構計畫的關係

`docs/refactor-step-plan.md` 規劃的是程式碼逐步重構。

本文件規劃的是每次重構後可以用來驗證的完整 E2E 操作路徑。

理想流程：

```text
開重構分支
完成單項改動
pnpm build
跑完整 E2E 視覺測試
檢查截圖與報表差異
確認通過後再 merge
```

如果重構只影響局部表格，可以先跑局部手動測試；但合併前建議至少跑一次完整路徑。

