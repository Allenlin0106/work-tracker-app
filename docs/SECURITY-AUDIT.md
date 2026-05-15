# Work Tracker App 安全審查報告（ISO 27001:2022）

> 版本：對應 git branch `claude/verify-content-ZxftO`（commit `33309f5`）
> 評估日：2026-05-14（v1.1：2026-05-15）
> 範圍：應用層（前端 React + 後端 Node/Express）、基礎設施（Docker Compose + Nginx + MongoDB）、流程文件

---

## 1. 範圍與方法

- **評估目標**：本機/內網部署的單頁應用 Work Tracker；前端 React 18 + Vite，後端 Express + Socket.io + Mongoose，反向代理為 Nginx，資料庫 MongoDB 7。
- **資產**：使用者身分（單一管理員帳號）、工作任務 / 日誌 / 群組 / 標籤資料、自簽 TLS 私鑰、MongoDB 資料庫。
- **威脅模型**：內網存取（受信任邊界）但仍假設攻擊者可取得 HTTPS 端點；不假設防火牆能阻止應用層攻擊。
- **方法**：白箱程式碼審查（grep + 全檔閱讀）；對映 ISO 27001:2022 Annex A 控制清單；每項以 file:line 作為證據。
- **不在範圍**：作業系統層加固（host hardening）、實體存取控制、社交工程演練。

---

## 2. 既有控制摘要

> Phase 1 拆分後的模組路徑（commit `045d24b`）；以下引用為 v1.1 後現況。

| 控制 | 實作位置 | 驗證 |
|---|---|---|
| R1 JWT 身分驗證 | `server/middleware/auth.js` `requireAuth/requireAdmin`；`server/sockets.js:21-30` Socket.io handshake | 受保護路由要求 `Authorization: Bearer` |
| R1 密碼雜湊 | `server/routes/auth.js:31` `bcrypt.hash(password, 12)`；`server/routes/users.js:37` reset 同樣 | bcrypt 12 rounds |
| R1 密碼強度 | `server/lib/security.js` `validatePassword`；前端 `src/lib/security.js` `isStrongPassword` | ≥12 字 + 大寫 + 小寫 + 數字 |
| R2 MongoDB 認證 | `docker-compose.yml:24,36-37` 由 `MONGO_ROOT_USER/PASS` 注入 | mongo 27017 不對外 |
| R3 TLS / HTTPS | `nginx.conf:9,15-16`；HTTP→HTTPS 轉址 `nginx.conf:1-5` | TLSv1.2/1.3 |
| R4 輸入消毒 | `server/lib/sanitize.js` `sanitizeBody`；URL 白名單 `server/lib/security.js` `isSafeUrl` | 拒 `$` key、限長度 5000、URL 協定白名單 |
| R5 CORS 白名單 | `server/index.js:23,25` 由 `CORS_ORIGIN` 控制 | 非萬用字元 |
| R6 速率限制 | `server/middleware/rateLimit.js` `authLimiter` / `apiLimiter` | 登入 5/15min、API 300/5min |
| R7 HTTP 安全標頭 | `server/index.js:22` `helmet`；`nginx.conf:18-26` HSTS/CSP/XFO/XCTO/Referrer/Permissions | 全部 `always` |
| R8 備份 | `backup.sh` mongodump + 30 天輪替 | 每日 cron 建議排程 |
| 稽核日誌 | `server/lib/audit.js` `logAudit`；morgan combined（`server/index.js:25`） | JSON 一行 / event；含 user.*、crud.*、auth.*、ws.* |
| **RBAC（v1.1 新增）** | `server/db.js` User.role；`server/middleware/auth.js` `requireAdmin`；`server/routes/crud.js` `ownerFilter`；`server/sockets.js` 房間分流 | admin/user 兩層；tasks/logs 依 owner 過濾 |
| **帳號管理 API（v1.1 新增）** | `server/routes/users.js` `/api/users` CRUD + reset/disable/enable | 全 admin only；保護最後 admin |

---

## 3. 風險清單

### 嚴重度分級

- 🔴 高：影響身分驗證、機密性或可用性，必須儘速處置。
- 🟡 中：可組合或在特定條件下利用，建議列入下一季開發。
- ⚪ 低：強化或最佳實踐，可滾動式處理。

### 已修補（本批次）

| # | 風險 | Annex A | 證據 | 修補位置 |
|---|---|---|---|---|
| H1 | JWT_SECRET 有預設 fallback `'dev-secret-change-in-production'`，生產缺 env 時不會明確失敗 | A.5.17 認證資訊管理 / A.8.24 密碼學使用 | 原 `server/index.js:13` | 改為 `requireEnv('JWT_SECRET', { minLen: 32 })`，缺失或過短即 `process.exit(1)` |
| H2 | 附件 URL 接受 `javascript:` 協定 → 儲存型 XSS（任何登入者可種植到他人帳號） | A.8.26 應用安全要求 / A.8.28 安全編碼 | `src/App.jsx:715-716, 1459` 直接渲染 `att.url` 為 `<a href>` | 前後端皆套 `isSafeUrl()`：協定白名單 `http/https/mailto/tel` + `data:image/*` |
| H3 | 無速率限制 → 登入暴力破解 / DoS | A.5.15 存取控制 / A.8.20 網路安全 | 原 `server/index.js:110-123` | 新增 `express-rate-limit`：authLimiter（5/15min）、apiLimiter（300/5min） |
| H4 | 無 HTTP 安全標頭 | A.8.23 Web filtering / 安全標頭 | 原 `nginx.conf` 全檔 | Helmet + Nginx：HSTS / CSP / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy |
| M2 | 幾乎無稽核日誌（A.8.15/A.8.16） | A.8.15 logging / A.8.16 monitoring | 原僅 WS connect log | morgan combined + `logAudit()` 為 auth/CRUD/error/ws 事件輸出 JSON |
| M3 | 錯誤回應洩漏 `err.message`（stack / DB 錯誤暴露） | A.8.26 應用安全 | 原 `server/index.js:89,105,121,151,161,171,181` | 全域 error handler，僅回 `{ error: 'Internal error' }` |
| M4 | 密碼無強度檢查 | A.8.5 安全認證 | 原 `server/index.js:94-107` 僅檢查非空 | `validatePassword`：≥12 字 + 大寫 + 小寫 + 數字 |
| L3 | 無 SECURITY.md / 漏洞回報窗口 | A.5.31 法規與合規 | 缺 | 新增 `SECURITY.md` |
| **M1** (v1.1) | 無資源擁有權檢查：任何登入者可讀寫他人所有資料 | A.5.15 / A.8.2 特權存取 | 原 `server/index.js:140-184` `models[col].find({})` 無 user filter | User 加 `role: admin\|user`；tasks/logs 加 `owner: ObjectId`；`server/routes/crud.js` `ownerFilter`：非 admin 只能讀寫自己份；`server/sockets.js` 房間分流推播；新增 `/api/users` CRUD 與帳號管理 UI（`src/pages/AccountsPage.jsx`） |

### 待補（後續 backlog，建立 `security/phase-2` issues）

| # | 風險 | Annex A | 證據 | 建議補強 |
|---|---|---|---|---|
| M5 | Mongo 使用 root 帳號連線（無 least privilege） | A.8.2 | `docker-compose.yml:24,36-37` | `mongo-init.js` 建立 `appUser` readWrite 限定 DB；compose 改用該帳號 |
| M6 | 備份未加密、無異地、無 restore-test | A.5.30 ICT 持續營運 / A.8.13 備份 | `backup.sh` | `mongodump --gzip --archive \| openssl enc -aes-256-cbc -pbkdf2`；rsync 至遠端；月度 restore-test |
| M7 | 所有容器以 root 執行 | A.8.4 對程式碼存取 | `Dockerfile.app`, `Dockerfile.backend` 無 `USER` | backend 加 `USER node`；app 改 `nginxinc/nginx-unprivileged` |
| L1 | 無 CI / 無 `npm audit` | A.8.8 技術弱點管理 | 缺 `.github/workflows/` | GitHub Actions：`npm ci` → `npm audit --audit-level=high` → `npm run build` → `trivy fs .` |
| L2 | 上傳影像僅前端 `accept="image/*"`，後端不驗 magic bytes | A.8.26 應用安全 | `server/index.js:24` `express.json({ limit:'50mb' })` 無內容驗證 | `file-type` magic bytes 驗 jpg/png/webp；拒 SVG |
| L4 | TLS：RSA-2048、ciphers `HIGH:!aNULL:!MD5`、無 HSTS preload | A.8.24 密碼學 | `certs/gen-cert.sh:10`、`nginx.conf:16` | ECDSA P-256 或 RSA-4096；ECDHE-only ciphers；HSTS preload 評估 |
| L5 | 容器無 healthcheck、無資源限額 | A.5.30 ICT 持續營運 | `docker-compose.yml` | 每服務加 `healthcheck` + `mem_limit`/`cpus` |
| 延伸 | JWT 30 天 expiry、無 refresh/revocation；無 MFA；無登入失敗鎖定 | A.8.5 | `server/index.js:184,196` | refresh token + 撤銷清單；TOTP MFA；失敗計數鎖定 |
| 延伸 | CSP 暫保留 `'unsafe-inline' style` | A.8.23 | `nginx.conf` CSP | 改用 nonce 模式去除 `'unsafe-inline'` |
| 延伸 | Token 儲存於 localStorage（XSS 持久化風險） | A.8.5 | `src/App.jsx:184,338,353` | 評估改 httpOnly cookie + SameSite=Strict + CSRF token |

---

## 4. ISO 27001:2022 Annex A 對映

✅ = 已實作；⚠️ = 部分實作；❌ = 未實作

| 控制 | 名稱 | 狀態 | 說明 |
|---|---|---|---|
| A.5.10 | 資產可接受使用 | ⚠️ | 未提供 acceptable-use policy；建議加入 ReadMe |
| A.5.15 | 存取控制 | ✅ | v1.1：admin/user 兩層 + tasks/logs ownership filter（`server/routes/crud.js`） |
| A.5.17 | 認證資訊 | ✅ | 密碼強度規則、bcrypt 12、JWT secret 強制 ≥32 字 |
| A.5.30 | ICT 持續營運 | ⚠️ | 有備份；缺 healthcheck、異地、restore-test |
| A.5.31 | 法規與合規 | ✅ | SECURITY.md 提供漏洞揭露流程 |
| A.5.34 | 個資保護 | ⚠️ | 不存放 PII；但稽核日誌含 username（內網可接受） |
| A.8.2 | 特權存取 | ⚠️ | v1.1：應用層 admin/user 角色已分離；Mongo 仍共用 root（M5 待補） |
| A.8.4 | 程式碼存取 | ⚠️ | 容器仍以 root 執行 |
| A.8.5 | 安全認證 | ⚠️ | 強密碼 + 速率限制；缺 MFA、refresh、失敗鎖定 |
| A.8.7 | 防惡意程式 | N/A | 不接受任意檔案上傳（僅 base64 影像） |
| A.8.8 | 技術弱點管理 | ❌ | 無 CI、無 audit；建議導入 |
| A.8.13 | 資訊備份 | ⚠️ | 30 天輪替；未加密、無異地、無 restore-test |
| A.8.15 | logging | ✅ | morgan + `logAudit` JSON 事件 |
| A.8.16 | 監控 | ⚠️ | 日誌僅 stdout，無集中收集 / 警報 |
| A.8.20 | 網路安全 | ✅ | Docker internal network；速率限制 |
| A.8.21 | 網路服務安全 | ✅ | TLS + CORS 白名單 |
| A.8.22 | 網路隔離 | ✅ | backend / mongo 不對外暴露 |
| A.8.23 | Web filtering / 安全標頭 | ✅ | HSTS / CSP / XFO / XCTO / Referrer-Policy / Permissions-Policy |
| A.8.24 | 密碼學 | ⚠️ | TLS 1.2/1.3 + bcrypt + JWT；TLS ciphers/key 可再強化 |
| A.8.25 | 安全開發生命週期 | ❌ | 缺正式 SDL；建議導入 review checklist |
| A.8.26 | 應用安全要求 | ✅ | 輸入消毒、URL 白名單、錯誤訊息一致化 |
| A.8.28 | 安全編碼 | ✅ | 環境變數強制檢查、無硬編密碼、parameterized query |
| A.8.32 | 變更管理 | ✅ | SECURITY.md 載明 PR review 流程 |

---

## 5. 補強路線圖

### Phase 1（已完成 — commit `b9646fc` `4ab9be3`）

- ✅ H1 環境變數強制檢查
- ✅ H2 URL 協定白名單（前後端）
- ✅ H3 express-rate-limit
- ✅ H4 Helmet + Nginx 安全標頭
- ✅ M2 morgan + logAudit
- ✅ M3 全域錯誤處理
- ✅ M4 密碼強度規則
- ✅ L3 SECURITY.md + 本報告

### Phase 2（已完成 — commit `de56c52`）

- ✅ **M1 RBAC**：admin/user 角色 + tasks/logs ownership filter + 帳號管理頁
- ✅ 帳號管理：`/api/users` CRUD、reset-password、disable/enable，含「保留最後 admin」保護
- ✅ Socket.io 房間分流：admin 房 + 個人房，非 admin 不再收到他人資料
- ✅ JWT payload 加 `role`；登入時拒絕已 disabled 帳號

### Phase 3（後續 backlog，建議分別建立 issue / PR）

| 優先 | 項目 | 估計工作量 | 相依 |
|---|---|---|---|
| 高 | L1 CI（lint / audit / build / image scan） | 0.5 天 | 無 |
| 中 | M7 容器降權 | 0.5 天 | 需驗證 nginx-unprivileged 路徑 |
| 中 | M5 Mongo per-app user | 1 天 | 需處理 first-run 初始化 |
| 中 | M6 備份加密 + 異地 | 1-2 天 | 需配置遠端目的地 |
| 中 | L2 影像 magic-bytes 驗證 | 0.5 天 | 無 |
| 低 | L4 TLS 強化 | 0.5 天 | 需重新發憑證 |
| 低 | L5 healthcheck + 資源限額 | 0.5 天 | 無 |
| 低 | 延伸：JWT refresh / MFA / 鎖定 | 5-10 天 | 大規模 UI 變動 |
| 低 | 延伸：CSP nonce 模式 | 1 天 | 需測試 Tailwind 編譯產物 |

---

## 6. 驗收標準

請依下列檢查項目逐一驗證 Phase 1 補強：

1. **環境變數強制**
   ```bash
   unset JWT_SECRET CORS_ORIGIN MONGO_URI
   node server/index.js
   # 預期：印出 "[Config] JWT_SECRET is required (>=32 chars)" 並 exit 1
   ```
2. **URL 白名單**：嘗試新增附件 `javascript:alert(1)` → 前端拒絕；若直接 POST → 後端清空為 `''`。
3. **速率限制**：
   ```bash
   for i in {1..6}; do curl -k -X POST https://192.168.146.160:8088/api/auth/login -H 'content-type: application/json' -d '{"username":"x","password":"y"}'; done
   # 第 6 次應回 429
   ```
4. **HTTP 標頭**：`curl -kI https://192.168.146.160:8088/` 應見 HSTS / CSP / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy。
5. **稽核日誌**：`docker logs work_tracker_backend | grep auth.login` 看見 JSON 事件，無密碼明文。
6. **錯誤處理**：`curl -k -X PATCH https://192.168.146.160:8088/api/tasks/不存在ID -H "authorization: Bearer xxx"` → 回 `{"error":"Internal error"}`，無 stack。
7. **密碼強度**：第一次 setup 用弱密碼 `pw` → 回 400；用 `LongerPass123!` → 成功。
8. **回歸**：`docker-compose up -d --build` 啟動成功，瀏覽器可登入、看任務、收 Socket.io 推播、上傳影像附件。
9. **RBAC (v1.1)**：建立 admin 後再建一個 user；該 user 只看得到自己的 task / log；admin 看得到全部；停用 user 後該帳號登入回 401；嘗試刪除最後一位 admin → 400。
10. **稽核 (v1.1)**：`docker logs work_tracker_backend | grep user\\.` 可見 user.create/update/disable/enable/delete/reset_password 事件。

---

## 7. 變更紀錄

| 日期 | 版本 | 摘要 |
|---|---|---|
| 2026-05-14 | 1.0 | 首版審查報告；Phase 1 補強同步合併（commit `b9646fc` `4ab9be3`） |
| 2026-05-15 | 1.1 | Phase 2 RBAC 完成（commit `de56c52`）：M1 移至已修補；A.5.15 ⚠️→✅、A.8.2 ❌→⚠️；Phase 1 重構後（commit `045d24b`）file:line 引用同步更新為新模組路徑 |
