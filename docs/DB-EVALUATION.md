# 後端資料庫評估：MongoDB vs PostgreSQL

> 評估版本：對應 git branch `claude/verify-content-ZxftO`（commit `33309f5`，Phase 1–4 完成後）
> 評估日：2026-05-14（v1.0：本文於 Phase 4 加入後即反映現況，無內容變更）
> 範圍：後端資料層；不評估 client-side 儲存

---

## 1. 範圍與評估維度

| 維度 | 說明 |
|---|---|
| Schema 演進 | 新增/修改欄位的成本與風險 |
| 查詢能力 | 報表 / 多表 join / 聚合 |
| 強型別與資料完整性 | 型別約束、FK、unique、check |
| 運維工具鏈 | 備份/還原/migration/replication 成熟度 |
| 即時推送整合 | 與 Socket.io broadcast 模式的契合度 |
| 既有投資 | 現有 Mongoose 程式、Docker volume、`backup.sh` |
| 切換成本 | code rewrite、資料遷移、測試 |
| RBAC / 多租戶 | Phase 2 RBAC 已落地，未來多租戶相容性 |
| 人才與生態 | 招聘容易度、AI tooling 支援 |

---

## 2. 現況事實

### 資料模型（commit `69e08a0` 後）

| Collection | 主要欄位（觀察自前後端使用） |
|---|---|
| `users` | username, passwordHash, role, disabled, createdBy, createdAt |
| `tasks` | title, group, assignee[], startDate, endDate, isRecurring, recurrenceType, recurrenceInterval, tags[], attachments[], **owner**, progress, checklist[] |
| `logs` | taskId, text, userName, timestamp, **owner** |
| `groups` | name, color |
| `tags` | name, color |

### 觀察：資料模型本質為**關聯式**

- `tasks.group` → `groups.id`
- `tasks.tags[]` → `tags.id`（M:N）
- `logs.taskId` → `tasks.id`（1:N）
- `tasks.owner` / `logs.owner` → `users.id`
- `users.createdBy` → `users.id`

目前以 `flexSchema { strict: false }`（`server/db.js`）儲存，無 FK，仰賴前端維持一致性。

### 既有投資

- 6 個 Mongoose model（`server/db.js`）
- 通用 CRUD 路由（`server/routes/crud.js`）依賴 `mongoose.model.find/create/findOneAndUpdate/findOneAndDelete`
- `backup.sh` 用 `mongodump` + 30 天輪替
- Docker compose `mongo:7` 服務 + `./mongo-data` 持久化 volume
- 實際 production deploy（內網）

---

## 3. MongoDB 留任的理由 ✅

| 理由 | 說明 |
|---|---|
| **既有投資** | mongoose model、backup script、container、volume、production data — 切換需重做 |
| **Schema 演進零摩擦** | `flexSchema` 讓前端任何新欄位（attachments、checklist、recurrence config）寫入即生效，無需 migration |
| **單檔結構契合** | task / log 內含巢狀 `attachments[]` / `checklist[]`，document model 直接表達；關聯式需正規化為多表 |
| **Socket.io broadcast 模式契合** | `find({}).lean()` → 整集合送出；MongoDB 對小集合全表查表現好 |
| **JSON 原生** | 後端 / 前端 / Mongo 三方皆 JSON，無型別轉換 |
| **學習曲線** | 既有開發者已熟 Mongoose；改 Postgres 需重學 SQL/Prisma |
| **影像 base64 暫存** | task.attachments[].url 大字串對 MongoDB BSON 自然，行內限制 16MB；Postgres `text` 也行但 row size 影響 vacuum |

---

## 4. PostgreSQL 取代的理由 ✅

| 理由 | 說明 |
|---|---|
| **資料模型本質關聯式** | tasks↔groups, tasks↔tags(M:N), logs↔tasks, owner↔users — 關聯式語意更精準 |
| **報表查詢能力** | 週/月報需要 GROUP BY / window function / CTE；目前在前端 `useMemo` 重算（`src/App.jsx` reportData）— Postgres 可上推到 DB |
| **強型別 / 約束 / FK** | `tasks.owner` 應為 FK；`role` 應為 enum；`progress` 0-100 check；目前全靠前端紀律 |
| **Migration 工具鏈成熟** | Prisma / Drizzle 提供版本化 schema migration；MongoDB 無原生 migration tool（要靠 mongo-migrate 等社群方案） |
| **Row Level Security (RLS)** | Phase 2 後引入 RBAC；多租戶情境下 Postgres RLS 比應用層 ownership filter 更安全（防 backend bug 漏 filter） |
| **生態工具** | pgAdmin / metabase / Apache Superset 等報表/維運工具豐富；MongoDB Compass 主要用於 ad-hoc query |
| **Index 多樣性** | B-tree, GIN, GIST, BRIN, partial, expression — 報表查詢可優化空間大 |
| **Backup 成熟度** | pg_basebackup + WAL 流式備份、PITR；mongodump 為 logical dump，大資料集慢 |

---

## 5. 切換成本估算

| 項目 | 估計工時 | 風險 |
|---|---|---|
| 引入 Prisma + 設計 schema（含 FK / enum / unique / check） | 1-2 天 | 低 |
| 改 `server/db.js` Mongoose → Prisma client 初始化 | 0.5 天 | 低 |
| 改 `server/routes/crud.js` 通用 CRUD：每個 collection 改成具名 model + 對應 Prisma method | 1-2 天 | 中（需逐表測試） |
| 改 `server/routes/users.js` + `auth.js`：bcrypt 邏輯不變，DB call 改 Prisma | 0.5 天 | 低 |
| `sockets.js` `find(filter).lean()` 改 Prisma `findMany` | 0.5 天 | 低 |
| 資料遷移腳本：`mongodump --json` → 寫 Node script → `prisma seed` | 1 天 | 中（影像 base64 體積） |
| Docker compose 增加 `postgres:17` + 改 `MONGO_URI` → `DATABASE_URL`；`backup.sh` 改 pg_dump | 0.5 天 | 低 |
| 測試（Phase 2 RBAC + Phase 3 logs query 全部回歸） | 1-2 天 | 中 |
| **合計** | **6-9 天** | 中 |

額外考量：
- Production downtime：約 2-4 小時（mongodump → import → cutover）
- 影像處理：`tasks.attachments[].url` 內 base64 為 row inline 大字串；Postgres 處理 OK 但建議未來改用 S3-like blob storage 並把 url 改成 reference

---

## 6. 與既有 backlog 的對映

| 既有 backlog | Mongo 留任 | Postgres 取代 |
|---|---|---|
| `docs/SECURITY-AUDIT.md` M1（RBAC） | 已用 ownership filter 完成 | 可進化為 RLS（更安全） |
| `docs/SECURITY-AUDIT.md` M5（per-app DB user） | mongo init script 建 readWrite 帳號 | Postgres `CREATE USER ... GRANT ...` 更直觀 |
| `docs/SECURITY-AUDIT.md` M6（備份加密） | mongodump → openssl enc | pg_dump → openssl enc（同樣成本） |
| `docs/ARCHITECTURE.md` 中期：報表 domain endpoint | `Aggregate pipeline` 寫 | SQL 直觀；用 view 維護 |
| `docs/ARCHITECTURE.md` 中期：強型別 schema | `strict:true` + Zod 驗證 | Prisma schema 即型別來源 |
| `docs/ARCHITECTURE.md` 中期：增量推播 | change stream + diff | LISTEN/NOTIFY 可用 |

**核心觀察**：兩者皆能滿足；Postgres 在 RBAC 與報表這兩個成長性最高的方向上**結構性優勢**較大。

---

## 7. 建議

### 短期（< 1 年、< 50 用戶、< 10K tasks）

**🟢 留任 MongoDB**

理由：切換成本（6-9 天 + downtime）相對於收益（型別 + 報表能力）尚未划算；Phase 2 ownership filter 已運作；Phase 3 logs query 純 client-side 即可。

伴隨動作：
- 對 `tasks` / `logs` schema 從 `flexSchema` 改為 `strict:true` + Zod 驗證（架構文件中期 backlog）
- 落實 SECURITY-AUDIT M5（mongo per-app user）

### 中期（成長中、報表需求增加 / 多租戶）

**🟡 評估改 Postgres**，先做 PoC：
1. 在 `docker-compose.yml` 加 postgres 服務（不影響現有 mongo）
2. 用 Prisma 建立 schema（對映現有 collections）
3. 寫 `mongodump → prisma seed` 遷移腳本
4. 切其中一個 collection（建議 `groups` / `tags` 兩個小表先試）做雙寫驗證
5. 評估查詢效能與開發體驗，再決定全面切換

### 長期（多租戶 / 強合規）

**🔴 切到 Postgres + RLS**

理由：
- 多租戶 isolation 在應用層 filter 容易因 bug 洩漏；RLS 在 DB 層強制
- 合規稽核需強型別、FK、版本化 migration；Mongo 走完該路線需大量補丁
- 報表複雜度上升時 SQL 表達力遠優於 aggregate pipeline

---

## 8. 結論

| 階段 | 推薦 | 主要驅動因素 |
|---|---|---|
| 現狀（單機內網、少量用戶） | **留 Mongo** | 切換成本 >> 收益；既有投資完整 |
| 多人協作 + 報表複雜化 | **PoC Postgres** | 報表能力 + 強型別 |
| 多租戶 / 合規 | **切 Postgres** | RLS + FK + 版本化 migration |

不建議「為了 schema 漂亮而切」；建議以**業務需求觸發**（報表、多租戶、合規）作為決策時點。決策時請回頭參考 `docs/ARCHITECTURE.md` 的中期路線圖，避免重工。

---

## 9. 變更紀錄

| 日期 | 版本 | 摘要 |
|---|---|---|
| 2026-05-14 | 1.0 | 首版 DB 評估；對映 Phase 1–3 落地後的程式狀態 |
