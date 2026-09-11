# 管理員重設密碼

## 目前狀態

前端與 Cloud Functions 程式已完成，但尚未部署。Firebase 專案必須啟用 Blaze（隨用隨付）方案，才能使用 Cloud Functions 所需的 Cloud Build 與 Artifact Registry。啟用前不可將這個介面發布到 GitHub Pages，避免按鈕連到不存在的後端服務。

## 流程

1. `users/{uid}.globalRoles` 含有 `systemAdmin` 的已登入使用者，可替其他帳號建立重設連結。
2. `createPasswordResetTicket` 建立 15 分鐘、限用一次的權杖；Firestore 只保存 SHA-256 雜湊值。重新建立會使同一帳號的舊連結失效。
3. 管理員可複製網址或掃描 QR Code，將連結交給目標使用者。
4. 使用者在該頁設定新密碼；`completePasswordReset` 驗證權杖後，以 Firebase Admin SDK 更新密碼並撤銷舊的登入工作階段。
5. 建立與完成都會寫入 `auditLogs`；票證狀態會記錄在 `passwordResetTickets`。

系統管理員帳號不可由這個後台流程重設；請以已登入狀態的「自行修改密碼」流程處理。管理人員角色仍依目前決策，以人工方式在 Firestore 指派。

## 部署與驗證

在 E2E 專案先啟用 Blaze 之後：

```powershell
pnpm dlx firebase-tools@latest deploy --only functions --project e2e
pnpm dlx firebase-tools@latest functions:list --project e2e
```

用現有 E2E 系統管理員帳號完成一次建立與使用連結的驗證後，再將相同函式部署到正式專案：

```powershell
pnpm dlx firebase-tools@latest deploy --only functions --project default
```

確認兩個 Firebase 專案都有函式後，才可推送前端，讓 GitHub Pages 上的按鈕正式可用。
