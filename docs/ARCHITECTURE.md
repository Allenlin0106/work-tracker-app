# Work Tracker App 架構分析（多層式架構優缺點）

> 評估版本：對應 git branch `claude/verify-content-ZxftO`（commit `f4f7a47` 為起點）
> 評估日：2026-05-14
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

### 2.3 程式碼結構摘要

| 層 | 檔案 | 行數 | 結構 |
|---|---|---|---|
| 前端 | `src/App.jsx` | 1878 | 單檔 mono：state / API / business / UI 全混 |
| 前端 | `src/main.jsx` | – | Vite 進入點 |
| 前端 | `src/index.css` | – | Tailwind v4 entry |
| 後端 | `server/index.js` | 309 | 單檔 mono：env / middleware / models / routes / sockets / error |
| 反向代理 | `nginx.conf` | 48 | TLS + 反代 + SPA fallback + 安全標頭 |
| 編排 | `docker-compose.yml` | 44 | 3 服務、internal network、env 注入 |
| 備份 | `backup.sh` | – | mongodump + 30 天輪替 |

---

## 3. 物理層 vs 邏輯層

| 維度 | 物理 (Physical) | 邏輯 (Logical) |
|---|---|---|
| 分離程度 | ✅ 3 容器、明確網路隔離 | ❌ 前後端各為單檔 mono |
| 邊界清晰度 | ✅ Nginx / Express / Mongo 各司其職 | ⚠️ 業務邏輯散落、無 service / repository 層 |
| 可獨立部署 | ✅ docker-compose 個別重啟 | ⚠️ 任何小改動都觸發整檔重建 |
| 可獨立替換 | ✅ MongoDB 可換、Vite 可換 | ❌ 單檔耦合難以替換 |

**核心觀察**：「物理 3-tier，邏輯 1-tier」的不對稱組合是本專案最大的架構張力。

---

## 4. 優點

### 4.1 物理層 / 基礎設施
- **前後端解耦**：前端為 SPA static bundle，後端為 Node API；可獨立更新而不互相阻塞。
- **網路隔離**：`backend` 與 `mongo` 容器不對外暴露 port（A.8.22）；攻擊面僅 Nginx 443 / 80。
- **TLS 集中**：TLS、HSTS、CSP、安全標頭全在 Nginx 統一處理；後端不需處理憑證。
- **部署簡單**：`docker-compose up -d --build` 一鍵啟動；維運心智負擔低。

### 4.2 跨切面
- **單一真相**：Socket.io broadcast 模式讓所有連線 client 即時同步（`server/index.js:102` `broadcastCollection`）。
- **安全控制集中**：JWT 中介層、`sanitizeBody`、`logAudit`、`helmet`、`rateLimit` 都在後端統一入口。
- **環境驗證 fail-closed**：`requireEnv` 啟動時即拒絕缺漏設定（`server/index.js:13-20`）。

### 4.3 技術選型
- **主流棧**：React/Vite/Express/Mongoose — 社群活躍、招聘容易、AI tooling 支援度高。
- **Mongoose 抽象**：仍可日後替換為 Prisma / 原生 driver 而不動 route handler。

---

## 5. 缺點與技術債

### 5.1 前端
- **單檔 1878 行 `src/App.jsx`**：
  - 閱讀 / grep / diff review 成本高；任何小改 PR diff 都污染。
  - 多人協作 merge conflict 機率高。
- **無 components / hooks / contexts / api 分離**：UI 與 state、副作用、business 全在同一 function scope。
- **業務邏輯前端化**：
  - 循環任務複刻：`src/App.jsx:858` `executeRecurrence` 透過通用 `/api/tasks` CRUD 拼湊；
  - 報表彙整：`src/App.jsx:522` `reportData = useMemo(...)` 即時計算，後端無對應 endpoint；
  - 影像壓縮：`src/App.jsx:115` `compressImage` canvas 處理，後端不做。
  - **影響**：邏輯一致性綁在「使用者使用的瀏覽器」；難以從 server 端寫測試或審計；多裝置可能行為不一致。
- **Token 存 localStorage**：XSS 持久化風險（已用 CSP/URL 白名單緩解但未根除）。

### 5.2 後端
- **單檔 309 行 `server/index.js`**：config / middleware / models / routes / sockets / error handler 全混。
- **缺 service / repository 層**：route handler 直接呼叫 Mongoose；未來導入 RBAC（M1）、資料擁有權、稽核鏈時需改動面廣。
- **`flexSchema` `strict:false`**（`server/index.js:87-91`）：
  - 優點：schema 演進零摩擦。
  - 代價：**無資料品質保證**，資料正確性完全仰賴前端；schema drift 隨時間累積。
- **通用 CRUD = DB proxy**：`COLLECTIONS = ['tasks','logs','groups','tags']` 用 `forEach` 動態註冊路由（`server/index.js:88,224`）— 後端淪為 thin proxy，無 domain logic。
- **Socket.io 全表 broadcast**：每筆 CRUD `find({}).lean()` 後 `io.emit` 整集合（`server/index.js:102-110`）。
  - 連線數 × 集合大小 的頻寬與序列化開銷會在使用者多時惡化。
- **缺 domain endpoints**（reports / recurrence）：架構無法承載未來「以報表為核心」的需求。

### 5.3 資料層
- **共用 root 帳號**：Mongo 連線使用 root（`docker-compose.yml:24`）— A.8.2 缺口（Phase 2 backlog M5）。
- **無資料擁有權欄位**：所有授權使用者可讀寫所有資料（Phase 2 backlog M1）。
- **無讀寫分離**：當報表查詢成長時無水平擴展餘地。
- **備份未加密 / 無異地**（Phase 2 backlog M6）。

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
| 關注點分離 | ⚠️ 部分 | 物理層分離成功；邏輯層失敗（單檔 mono） |
| 可獨立部署 / 擴展 | ⚠️ 部分 | 前端 OK；後端 Socket.io 單實例難橫向擴 |
| 可替換層實作 | ✅ | Mongoose / REST / Vite 都可換 |
| 易於測試 | ❌ | 0 測試；mono 結構難寫 unit test |
| 安全邊界明確 | ✅ | 物理隔離 + TLS + CORS + JWT + 速率限制 |
| 維運清楚 | ✅ | docker-compose 三服務一目了然 |

### 6.2 常見缺點

| 缺點 | 本專案是否中招 | 緩解 |
|---|---|---|
| 跨層呼叫額外延遲 | 低 | 全部在 docker internal network |
| 改一個 feature 需動多層 | ⚠️ | 缺 service 層，動 1 處常需動 UI + 路徑+ broadcast |
| 難以追蹤端到端流程 | 高 | 無 tracing、無集中 log |
| 演化成「貧血層」 | ✅ 已發生 | flexSchema + 通用 CRUD = 後端是 DB proxy |
| 部署複雜度 | 低 | docker-compose 已壓平 |

---

## 7. 改善路線圖

### 7.1 短期（1-2 週，不破壞現有 API）

| 項目 | 動作 |
|---|---|
| 後端模組化 | 拆 `server/index.js` → `server/{config,middleware,models,routes,services,sockets,errors}.js` |
| 前端基礎拆分 | 抽 `src/components/`、`src/api/`、`src/hooks/`；`reportData` / `executeRecurrence` / `compressImage` 提出為 hook 或 util |
| 加入最小測試 | vitest（前端）+ supertest（後端 routes 煙霧測試） |
| 引入 lint | eslint + prettier，配合 CI（Phase 2 L1） |

### 7.2 中期（1-2 月，需 PR 審查）

| 項目 | 動作 | 相關 backlog |
|---|---|---|
| 資料擁有權 + RBAC | 在拆好的 repository 層加 `owner: ObjectId` filter；UI 加共享開關 | Security M1 |
| 報表 / 循環任務 domain endpoint | 把 `reportData` 與 `executeRecurrence` 上推到後端 `/api/reports`、`/api/tasks/:id/recur` | — |
| Schema 強型別 | 對核心 collections（tasks / logs）改用 `strict:true` schema + Zod 驗證 | — |
| Socket.io 改增量推播 | `emit('tasks:patch', { id, change })` 取代全集合 broadcast | — |
| Mongo per-app user | 從 root 切換為 readWrite 限定 DB 帳號 | Security M5 |

### 7.3 長期（3-6 月，視成長決定）

| 項目 | 觸發條件 |
|---|---|
| BFF / GraphQL gateway | 前端需要組合多次 REST call 拼報表時 |
| 觀測性平台 | 多實例部署或無法重現 bug 時；建議 OpenTelemetry + Loki/Tempo/Grafana |
| Read-replica / 報表庫 | 任務 > 10K 或同時用戶 > 30 |
| Socket.io Redis adapter | 後端橫向擴 ≥ 2 實例時 |

---

## 8. 結論

- **本專案是「物理 3-tier，邏輯 1-tier」的混合體**：基礎設施分層做得對，但內部 codebase 尚未享受多層架構應有的可維護性紅利。
- **目前痛點集中在「邏輯層失蹤」**：未來任何 RBAC、報表、可測試性、可觀測性投資前，都應先做短期模組化，否則修改成本會 super-linear 成長。
- **不建議「為了多層而多層」**：微服務、CQRS、Event Sourcing 等對目前規模都過度工程。**保持現有 3-tier physical + 補上邏輯層分離**，是 ROI 最佳的下一步。
- **與安全 backlog 對齊**：本路線圖中期項目（RBAC、per-app DB user）與 `docs/SECURITY-AUDIT.md` Phase 2（M1/M5）為同一批工作；建議合併規劃避免重工。

---

## 9. 變更紀錄

| 日期 | 版本 | 摘要 |
|---|---|---|
| 2026-05-14 | 1.0 | 首版架構分析；對映 Phase 1 安全補強後現況 |
