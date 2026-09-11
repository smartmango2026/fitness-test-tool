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

## E2E 重設密碼驗證流程

手動驗證時，請以 `systemAdmin` 登入 E2E 後台，選擇一個非管理員帳號，依序確認：

1. 點選「啟動重設密碼流程」後出現一次性 QR Code、連結與複製按鈕。
2. 在無痕視窗開啟連結，設定至少 8 個字元的新密碼。
3. 用新密碼登入成功，舊密碼無法登入。
4. 重新使用同一連結時，畫面顯示連結已使用或無效。

自動化整合測試會建立一個 `e2e_reset_` 前綴帳號，完成上述流程、驗證已用連結遭拒絕，並將密碼還原為原始測試密碼。它只會在明確設定環境變數後執行：

```powershell
$env:RUN_PASSWORD_RESET_E2E = "1"
$env:PASSWORD_RESET_ADMIN_USERNAME = "<E2E systemAdmin 帳號>"
$env:PASSWORD_RESET_ADMIN_PASSWORD = "<該帳號密碼>"
$env:E2E_BASE_URL = "https://smartmango2026.github.io/fitness-test-tool/e2e/"
$env:E2E_SKIP_WEB_SERVER = "1"
pnpm test:e2e:password-reset
```

測試使用已發布的 E2E 網站，確保瀏覽器來源符合 Worker 的 CORS 限制。測試完成後，若要移除產生的帳號與相關 Firestore 資料，執行：

```powershell
pnpm cleanup:e2e -- --apply
```
