# Work Tracker App 架構分析（多層式架構優缺點）

> 評估版本：對應 git branch `claude/verify-content-ZxftO`（commit `33309f5`）
> 評估日：2026-05-14（v1.1：2026-05-15，反映 Phase 1 重構與 Phase 2 RBAC）
> 範圍：應用層 + 基礎設施層 + 跨切面（observability / testability / scalability）

---

## 1. 範圍與方法

- **評估對象**：work-tracker-app 全部源碼與部署設定。
- **方法**：
  - 白箱閱讀（檔案 + 行數逐項對應）
  - 以 Mark Richards《Software Architecture Patterns》之三層式架構（Presentation / Business / Persistence）為對照
  - 加入跨切面：security、observability、testability、scalability
- **不評估**：團隊規模、組織分工、商業 SLA、總體成本（屬組織層議題）。

---

## 2. 現況架構

### 2.1 流程圖

```
[Browser]
   | HTTPS 8088 (TLS 1.2/1.3, HSTS, CSP, X-Frame-Options)
   v
[app: Nginx + React SPA]              ← Dockerfile.app (multi-stage)
   | /api/*  /socket.io/*  (internal docker network: tracker_network)
   v
[backend: Express + Socket.io]        ← Dockerfile.backend
   | mongodb://mongo:27017?authSource=admin
   v
[mongo: MongoDB 7]                    ← 不對外暴露 port
   ^
   | mongodump（host-mount: ./backups）
   |
[backup.sh]（建議 cron）
```

### 2.2 信任與安全邊界

- **公網邊界**：僅 `app` 容器的 443 (HTTPS) 與 80 (→301 HTTPS) 對外（`docker-compose.yml:8-10`）
- **TLS 終點**：Nginx；後續到 `backend` / `mongo` 為 docker internal network 明文（`nginx.conf:13-16`）
- **認證邊界**：所有 `/api/*` 與 `socket.io` 連線皆需 JWT（`server/index.js` requireAuth + Socket.io middleware）
- **資料庫邊界**：MongoDB root 帳號（`docker-compose.yml:24,36-37`），目前共用，無 least-privilege 應用帳號

### 2.3 程式碼結構摘要（v1.1：Phase 1 重構後）

**後端 `server/`（已模組化，commit `045d24b`）**

| 檔 | 行數 | 職責 |
|---|---|---|
| `index.js` | 45 | wire-up：載入 config → middleware → routes → sockets → listen |
| `config.js` | 16 | `requireEnv` 環境變數驗證 |
| `db.js` | 54 | mongoose connect + User/flexSchema + COLLECTIONS + ensureFirstAdmin + toDoc/stripDoc |
| `sockets.js` | 67 | Socket.io init + JWT 驗證 + 房間分流 + broadcastCollection |
| `lib/audit.js` | 11 | logAudit JSON helper |
| `lib/security.js` | 29 | isSafeUrl + validatePassword |
| `lib/sanitize.js` | 27 | sanitizeBody（依賴 security） |
| `middleware/auth.js` | 20 | requireAuth + requireAdmin |
| `middleware/rateLimit.js` | 19 | authLimiter + apiLimiter |
| `routes/auth.js` | 65 | /api/auth/{status,setup,login} |
| `routes/users.js` | 143 | /api/users CRUD + reset/disable/enable（admin only） |
| `routes/crud.js` | 81 | COLLECTIONS 動態 CRUD + ownerFilter |

**前端 `src/`（部分模組化，commit `045d24b` `de56c52` `69e08a0`）**

| 檔 | 行數 | 職責 |
|---|---|---|
| `App.jsx` | 1865 | 主組件：狀態 / business 邏輯 / 大部分 UI（reportData / executeRecurrence / compressImage 仍在此） |
| `main.jsx` | – | Vite 進入點 |
| `index.css` | – | Tailwind v4 entry |
| `lib/api.js` | 65 | apiPost/Patch/Delete + usersApi（list/create/update/resetPassword/disable/enable/remove） |
| `lib/security.js` | 20 | isSafeUrl + isStrongPassword + PASSWORD_HINT |
| `lib/socket.js` | 3 | Socket.io 單例 |
| `pages/AccountsPage.jsx` | 266 | 帳號管理（admin only） |
| `pages/LogsQueryPage.jsx` | 155 | 工作日誌查詢 |

**基礎設施**

| 檔 | 行數 | 職責 |
|---|---|---|
| `nginx.conf` | 48 | TLS + 反代 + SPA fallback + 安全標頭 |
| `docker-compose.yml` | 44 | 3 服務、internal network、env 注入 |
| `backup.sh` | – | mongodump + 30 天輪替 |

---

## 3. 物理層 vs 邏輯層

| 維度 | 物理 (Physical) | 邏輯 (Logical) v1.1 |
|---|---|---|
| 分離程度 | ✅ 3 容器、明確網路隔離 | ⚠️ 後端已模組化（12 檔）；前端仍以 1865 行 `App.jsx` 為主，但 `lib/` `pages/` 已抽出 |
| 邊界清晰度 | ✅ Nginx / Express / Mongo 各司其職 | ⚠️ 後端有 routes/middleware/lib 邊界；service / repository 層尚未引入 |
| 可獨立部署 | ✅ docker-compose 個別重啟 | ⚠️ 改 route 不再動到 sockets；前端仍重建整 bundle |
| 可獨立替換 | ✅ MongoDB 可換、Vite 可換 | ⚠️ 後端解耦良好；前端 `App.jsx` 仍耦合 |

**核心觀察（v1.1 修正）**：「物理 3-tier，邏輯 1-tier」已演進為「物理 3-tier，邏輯部分分層」。**後端邏輯層**已透過 Phase 1 重構落地（config / db / lib / middleware / routes / sockets 六大邊界），但 **前端 `App.jsx` 仍是主要技術債**，UI/state/business 仍混在單檔。

---

## 4. 優點

### 4.1 物理層 / 基礎設施
- **前後端解耦**：前端為 SPA static bundle，後端為 Node API；可獨立更新而不互相阻塞。
- **網路隔離**：`backend` 與 `mongo` 容器不對外暴露 port（A.8.22）；攻擊面僅 Nginx 443 / 80。
- **TLS 集中**：TLS、HSTS、CSP、安全標頭全在 Nginx 統一處理；後端不需處理憑證。
- **部署簡單**：`docker-compose up -d --build` 一鍵啟動；維運心智負擔低。

### 4.2 跨切面
- **即時同步**：Socket.io 房間分流（`server/sockets.js`）：admin 房收全部、個人房收自己份；非 admin 不會收到他人資料。
- **安全控制集中**：`server/middleware/{auth,rateLimit}.js` + `server/lib/{audit,security,sanitize}.js` 單一進入點。
- **環境驗證 fail-closed**：`requireEnv` 啟動時即拒絕缺漏設定（`server/config.js`）。
- **RBAC（v1.1）**：admin/user 兩層；CRUD `ownerFilter` 與 Socket.io 房間機制協同。

### 4.3 技術選型
- **主流棧**：React/Vite/Express/Mongoose — 社群活躍、招聘容易、AI tooling 支援度高。
- **Mongoose 抽象**：仍可日後替換為 Prisma / 原生 driver 而不動 route handler。

---

## 5. 缺點與技術債

### 5.1 前端
- **1865 行 `src/App.jsx` 仍是主檔**（v1.1 略減；`AccountsPage` / `LogsQueryPage` 已抽出）：
  - 閱讀 / grep / diff review 成本仍高；任何小改 PR diff 仍污染。
  - 多人協作 merge conflict 機率仍高。
- **components / hooks / contexts 尚未分離**：`lib/` 已抽 API/security/socket，`pages/` 已有兩頁，但主要 UI（任務列表、甘特、週/月報、詳情視窗）仍混在 `App.jsx`。
- **業務邏輯前端化**：
  - 循環任務複刻：`src/App.jsx` `executeRecurrence` 透過通用 `/api/tasks` CRUD 拼湊；
  - 報表彙整：`src/App.jsx` `reportData = useMemo(...)` 即時計算，後端無對應 endpoint；
  - 影像壓縮：`src/App.jsx` `compressImage` canvas 處理，後端不做。
  - **影響**：邏輯一致性綁在「使用者使用的瀏覽器」；難以從 server 端寫測試或審計；多裝置可能行為不一致。
- **Token + role + userId 存 localStorage**：XSS 持久化風險（已用 CSP/URL 白名單緩解但未根除）。

### 5.2 後端（v1.1 後）
- ~~**單檔 309 行 `server/index.js`**~~ ✅ 已修：Phase 1 拆成 12 個模組，主檔 45 行純 wire-up。
- ~~**缺 service / repository 層**~~ ⚠️ 部分修：`routes/` / `middleware/` / `lib/` 三層邊界已劃；但仍無獨立 service / repository（route handler 直接呼叫 Mongoose model）。
- **`flexSchema` `strict:false`**（`server/db.js`）：
  - 優點：schema 演進零摩擦。
  - 代價：**無資料品質保證**，資料正確性完全仰賴前端；schema drift 隨時間累積。
- **通用 CRUD 仍是 thin proxy**：`COLLECTIONS = ['tasks','logs','groups','tags']` 用 `forEach` 動態註冊路由（`server/routes/crud.js`）— v1.1 加了 `ownerFilter`，但仍無 domain logic（無 reports / recurrence 端點）。
- **Socket.io broadcast 改為房間分流**（v1.1，`server/sockets.js` `broadcastCollection`）：
  - admin 房收全表、owner 個人房收自己份；非 admin 不再收到他人資料（功能 + 安全雙收）。
  - 仍是「整集合送出」而非 patch；連線數 × 集合大小仍是潛在瓶頸（規模化時改增量 diff）。
- **缺 domain endpoints**（reports / recurrence）：架構無法承載未來「以報表為核心」的需求。

### 5.3 資料層
- **共用 root 帳號**：Mongo 連線使用 root（`docker-compose.yml:24`）— A.8.2 部分缺口（M5 待補）。
- ~~**無資料擁有權欄位**~~ ✅ 已修：v1.1 加 `tasks.owner` / `logs.owner`，CRUD/Socket 皆按 owner 過濾。
- **無讀寫分離**：當報表查詢成長時無水平擴展餘地。
- **備份未加密 / 無異地**（待補 M6）。

### 5.4 跨切面
- **Logging**：Phase 1 已加 `morgan` + `logAudit` JSON，但僅 stdout，無集中收集 / alerting（A.8.16 部分達標）。
- **可觀測性**：無 metrics（Prometheus）、無 distributed tracing；單一節點下勉強，未來多實例難排錯。
- **可測試性**：**0 測試**；單檔 mono 結構也難寫 unit test。
- **CI/CD**：無 `.github/workflows/`（Phase 2 backlog L1）。
- **容器以 root 執行**（Phase 2 backlog M7）。
- **水平擴展**：backend 為單實例 + 內建 Socket.io；要橫向擴展需引入 sticky session 或 Socket.io Redis adapter。

---

## 6. 多層架構通用優缺點 vs 本專案實際表現

### 6.1 通常宣稱的優點

| 優點 | 本專案是否兌現 | 原因 |
|---|---|---|
| 關注點分離 | ⚠️ 部分（後端 ✅、前端 ⚠️） | v1.1：後端已 12 模組；前端 `App.jsx` 仍大 |
| 可獨立部署 / 擴展 | ⚠️ 部分 | 前端 OK；後端 Socket.io 單實例難橫向擴 |
| 可替換層實作 | ✅ | Mongoose / REST / Vite 都可換 |
| 易於測試 | ❌ | 0 測試；後端模組化後 unit test 變可行但尚未寫 |
| 安全邊界明確 | ✅ | 物理隔離 + TLS + CORS + JWT + 速率限制 + RBAC |
| 維運清楚 | ✅ | docker-compose 三服務一目了然 |

### 6.2 常見缺點

| 缺點 | 本專案是否中招 | 緩解 |
|---|---|---|
| 跨層呼叫額外延遲 | 低 | 全部在 docker internal network |
| 改一個 feature 需動多層 | ⚠️ | 後端模組邊界清楚但仍需經 routes → middleware → db；前端動 `App.jsx` |
| 難以追蹤端到端流程 | 中 | v1.1：morgan + logAudit 完整，但仍無 distributed tracing / 集中收集 |
| 演化成「貧血層」 | ⚠️ 仍存在 | flexSchema + 通用 CRUD = 後端大致是 DB proxy（v1.1 加了 ownership filter，但仍無 domain endpoints） |
| 部署複雜度 | 低 | docker-compose 已壓平 |

---

## 7. 改善路線圖

### 7.1 短期（1-2 週，不破壞現有 API）

| 項目 | 狀態 | 動作 |
|---|---|---|
| 後端模組化 | ✅ 完成（commit `045d24b`） | `server/{config,db,lib,middleware,routes,sockets}.js` |
| 前端基礎拆分 | ⚠️ 部分（`lib/` + `pages/` 已抽） | 仍需從 `App.jsx` 抽 components/hooks；`reportData` / `executeRecurrence` / `compressImage` 提為 hook 或 util |
| 加入最小測試 | ❌ 待辦 | vitest（前端）+ supertest（後端 routes 煙霧測試） |
| 引入 lint | ❌ 待辦 | eslint + prettier，配合 CI（SECURITY-AUDIT L1） |

### 7.2 中期（1-2 月，需 PR 審查）

| 項目 | 狀態 | 動作 | 相關 backlog |
|---|---|---|---|
| 資料擁有權 + RBAC | ✅ 完成（commit `de56c52`） | `tasks.owner` / `logs.owner` + admin/user + AccountsPage | Security M1 |
| 報表 / 循環任務 domain endpoint | ❌ 待辦 | 把 `reportData` 與 `executeRecurrence` 上推到後端 `/api/reports`、`/api/tasks/:id/recur` | — |
| Schema 強型別 | ❌ 待辦 | 對核心 collections（tasks / logs）改用 `strict:true` schema + Zod 驗證 | — |
| Socket.io 改增量推播 | ❌ 待辦（v1.1 已加房間分流，仍是整集合送出） | `emit('tasks:patch', { id, change })` 取代全集合 broadcast | — |
| Mongo per-app user | ❌ 待辦 | 從 root 切換為 readWrite 限定 DB 帳號 | Security M5 |
| 前端 App.jsx 大幅拆分 | ❌ 待辦 | 抽出任務列表、甘特、週/月報、詳情視窗為獨立 component | — |

### 7.3 長期（3-6 月，視成長決定）

| 項目 | 觸發條件 |
|---|---|
| BFF / GraphQL gateway | 前端需要組合多次 REST call 拼報表時 |
| 觀測性平台 | 多實例部署或無法重現 bug 時；建議 OpenTelemetry + Loki/Tempo/Grafana |
| Read-replica / 報表庫 | 任務 > 10K 或同時用戶 > 30 |
| Socket.io Redis adapter | 後端橫向擴 ≥ 2 實例時 |

---

## 8. 結論（v1.1 更新）

- **本專案已從「物理 3-tier、邏輯 1-tier」演進為「物理 3-tier、邏輯部分分層」**：後端 Phase 1 重構落地（12 個模組）、Phase 2 RBAC 完成（owner 過濾 + 帳號管理），可維護性紅利開始兌現。
- **目前最大痛點為「前端 App.jsx 仍 1865 行」**：是下一波 ROI 最高的拆分對象（建議任務列表 / 甘特 / 週月報 / 詳情視窗各成 component）。
- **後端仍是 thin DB proxy**：缺 domain endpoints（reports / recurrence）；補上的時機建議與「Schema 強型別」綁定一起做。
- **不建議「為了多層而多層」**：微服務、CQRS、Event Sourcing 等對目前規模仍過度工程。
- **與安全 backlog 對齊**：M1 已完成；下一波路線圖（前端拆分、reports endpoint、Mongo per-app user）與 `docs/SECURITY-AUDIT.md` Phase 3 / `docs/DB-EVALUATION.md` 中期項目重疊，建議合併規劃。

---

## 9. 變更紀錄

| 日期 | 版本 | 摘要 |
|---|---|---|
| 2026-05-14 | 1.0 | 首版架構分析；對映 Phase 1 安全補強後現況 |
| 2026-05-15 | 1.1 | 反映 Phase 1 後端模組化（commit `045d24b`）與 Phase 2 RBAC（commit `de56c52`）；新增 `src/pages/` 與 `src/lib/`；7.1 / 7.2 路線圖標示完成項；結論更新「物理 3-tier、邏輯部分分層」 |
