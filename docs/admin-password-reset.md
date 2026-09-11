# 管理員重設密碼

## 目前狀態

E2E 使用 Cloudflare Worker 作為受信任後端；Firebase 專案不需要啟用 Blaze。Google 服務帳戶的 JSON 私鑰只保存在 Cloudflare Worker 的加密 Secret `GOOGLE_SERVICE_ACCOUNT_JSON`，不得存入 GitHub、前端程式或文件。

## 流程

1. `users/{uid}.globalRoles` 含有 `systemAdmin` 的已登入使用者，可替其他帳號建立重設連結。
2. Cloudflare Worker 建立 15 分鐘、限用一次的權杖；Firestore 只保存 SHA-256 雜湊值。重新建立會使同一帳號的舊連結失效。
3. 管理員可複製網址或掃描 QR Code，將連結交給目標使用者。
4. 使用者在該頁設定新密碼；Worker 驗證權杖後，以 Google Identity Toolkit 管理 API 更新密碼並撤銷舊的登入工作階段。
5. 建立與完成都會寫入 `auditLogs`；票證狀態會記錄在 `passwordResetTickets`。

系統管理員帳號不可由這個後台流程重設；請以已登入狀態的「自行修改密碼」流程處理。管理人員角色仍依目前決策，以人工方式在 Firestore 指派。

## 部署與驗證

Worker 原始碼位於 `workers/password-reset-api`，由 GitHub Actions 發布。GitHub 只保存 Cloudflare 的部署 Token；Google 服務帳戶私鑰仍只保存於 Cloudflare Secret。

首次發布前，在 GitHub repository 的 Actions secrets 新增 `CLOUDFLARE_API_TOKEN`。這個 Token 僅授予該 Cloudflare 帳戶的 **Workers Scripts: Edit** 權限。設定後，手動執行「Deploy E2E password reset Worker」工作流程。

確認 Worker 已發布後：

```powershell
curl https://fitness-test-tool-e2e-reset-api.smartmango2026.workers.dev/health
```

用現有 E2E 系統管理員帳號完成一次建立與使用連結的驗證後，再為正式環境建立獨立 Worker 與獨立服務帳戶；不可共用 E2E 私鑰。
