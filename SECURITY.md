# 安全政策（Security Policy）

## 支援版本

僅 `main` 分支最新發行版本接受安全修補。歷史 tag 不再回補。

## 漏洞回報

請以**私下管道**回報，避免公開揭露導致受影響系統暴露。

- 聯絡窗口：`TODO: 填入維運/安全聯絡 email`
- 回覆 SLA：72 小時內初步回覆；視嚴重度於 7-30 天內提供修補
- 揭露窗口：建議 90 天內協調揭露

請於回報中提供：
1. 受影響元件（前端 / 後端 / Nginx / Mongo / Docker 組態）
2. 重現步驟（含 PoC 程式碼或 curl 範例）
3. 預期影響（資料外洩 / 權限提升 / 服務中斷 等）
4. 您願意被致謝的方式（可選）

## 已實作的安全控制摘要

完整審查結果與 ISO 27001:2022 Annex A 對映請參考 [`docs/SECURITY-AUDIT.md`](docs/SECURITY-AUDIT.md)。重點：

- **R1 身分驗證**：JWT（bcrypt 12 rounds），密碼強度規則（≥12 字 + 大小寫 + 數字）
- **R2 資料庫存取**：MongoDB 認證、port 不對外
- **R3 傳輸加密**：TLS 1.2/1.3、HTTP→HTTPS 轉址、HSTS
- **R4 輸入消毒**：NoSQL 注入防護、URL 協定白名單
- **R5 CORS 白名單**：環境變數限定
- **R6 速率限制**：登入 5 次/15 分鐘、一般 API 300 次/5 分鐘
- **R7 HTTP 安全標頭**：Helmet + Nginx（HSTS、CSP、X-Frame-Options、X-Content-Type-Options、Referrer-Policy、Permissions-Policy）
- **R8 備份**：mongodump 每日 + 30 天輪替
- **RBAC（admin/user 兩層）**：第一位使用者自動成為 admin；admin 可管理帳號（建立 / 停用 / 啟用 / 重設密碼 / 刪除），且系統保留至少一位啟用的 admin；tasks 與 logs 依 owner 過濾，非 admin 僅看自己份
- **稽核日誌**：登入/登出/CRUD/帳號變更/錯誤事件以 JSON 寫入 stdout（由 docker logs 收集）

## 變更管理

- 所有變更須經 Pull Request review 後合併。
- Security-sensitive 變更（auth/權限/加密/輸入驗證）需至少一位 reviewer 明確核可。
- 合併前應通過：`npm run build`、`docker-compose up -d --build` 健康檢查。
- 依賴升級：建議每月執行 `npm audit --audit-level=high`；高危漏洞需於 7 天內處理（後續導入 CI 自動檢查，見 backlog）。

## 不在保固範圍

- 自簽憑證需使用者手動信任，瀏覽器將顯示憑證警告（內網部署可接受）。
- 客戶端為 SPA，token 與 role 儲存於 localStorage，受 XSS 影響時存在外洩風險；本專案以多層防護降低 XSS 機率（CSP / 輸入消毒 / URL 白名單）。
- 後端目前為單一租戶 admin/user 模型；非 admin 僅可讀寫自己 owner 的 tasks / logs；尚未提供「多租戶 + 群組共享」更細粒度授權。
