Progress Hub - 部門工作進度追蹤平台

這是一個專為部門內部設計的工作進度追蹤系統。採用 React 構建前端介面，搭配 Tailwind CSS v4 提供現代化 UI，並使用 Express.js + MongoDB 提供後端 API 與即時推送（Socket.io），透過 Docker Compose 進行完整封裝與部署。為符合 ISO 27001 內網佈署需求，已加入 JWT 驗證、HTTPS/TLS、CORS 白名單與資料庫認證等安全強化。

🚀 核心功能

工作項目管理：支援任務建立、編輯、刪除與進度追蹤。

雙視圖切換：

列表視圖：清晰呈現任務詳情與進度條。

甘特圖視圖：動態視覺化時程規劃，支援「日/週/月」三種縮放尺度，並具備子項展開功能。

自動化報表：提供週報與月報摘要，自動彙整近期完成的任務與日誌回報。

小組與人員管理：自定義執行小組配色，並具備常用負責人記憶功能。

例行任務複刻：支持循環任務（日/週/月）的一鍵結案並開啟下期功能。

即時同步：多人使用時，任何一方的操作（新增/修改/刪除）均透過 Socket.io 即時推送至所有連線用戶。

全地端運行：所有資料儲存於本地 MongoDB，確保資料隱私與安全性。

🛠 系統架構與技術棧

前端框架：React 18 (Vite 5)

樣式系統：Tailwind CSS v4

後端服務：Express.js + Socket.io

資料庫：MongoDB 7

部署環境：Docker Desktop (Docker Compose)

反向代理 / TLS 終端：Nginx (Alpine 版)

📁 專案資料夾結構

work-tracker-app/
├── src/
│   ├── App.jsx            # 主要程式邏輯 (Socket.io + REST API)
│   ├── main.jsx           # React 進入點
│   └── index.css          # Tailwind v4 全域樣式設定
├── server/
│   ├── index.js           # Express + Socket.io + Mongoose 後端（含 JWT/CORS/輸入消毒）
│   └── package.json       # 後端依賴
├── certs/
│   ├── gen-cert.sh        # 自簽 TLS 憑證產生腳本
│   └── server.crt/.key    # (執行 gen-cert.sh 後產生) Nginx 掛載用憑證
├── mongo-data/            # (自動產生) MongoDB 資料持久化目錄
├── backups/               # (執行 backup.sh 後產生) MongoDB 備份目錄
├── .env.example           # 環境變數範本（複製為 .env 後填入實際值）
├── backup.sh              # MongoDB 自動備份腳本（含 30 天輪替）
├── Dockerfile.app         # 前端應用程式建置腳本 (Node 20 + Nginx)
├── Dockerfile.backend     # 後端伺服器建置腳本 (Node 20)
├── docker-compose.yml     # 容器編排配置文件
├── nginx.conf             # Nginx 反向代理 + HTTPS 設定
├── package.json           # 前端依賴與版本管理
├── vite.config.js         # Vite 編譯設定
└── index.html             # 基礎 HTML 範本


⚙️ 快速啟動步驟

0. 設定環境變數

複製 .env.example 為 .env，並填入實際值（.env 已在 .gitignore 中，不會進入版本控制）：

cp .env.example .env

必填欄位：
- MONGO_ROOT_USER / MONGO_ROOT_PASS：MongoDB root 帳密（請改為強密碼）
- JWT_SECRET：JWT 簽章金鑰（建議 32 字元以上的隨機字串）
- CORS_ORIGIN：HTTPS 前端位址，例如 https://192.168.146.160:8088（用於後端 CORS 白名單）

1. 產生 TLS 自簽憑證

Nginx 以 HTTPS 對外服務，需先產生自簽憑證（預設 IP 為 192.168.146.160）：

bash certs/gen-cert.sh 192.168.146.160

執行後會在 certs/ 目錄產生 server.crt 與 server.key，docker-compose.yml 會以唯讀方式掛載至 Nginx 容器內 /etc/nginx/certs。

2. 確認主機 IP

若主機 IP 不是 192.168.146.160，請同步更新：
- .env 中的 CORS_ORIGIN
- 重新執行 certs/gen-cert.sh <新IP> 以產生對應 IP 的憑證

3. 執行 Docker 建置與啟動

在專案根目錄開啟終端機，執行：

docker-compose up -d --build


4. 訪問服務

工作追蹤平台：https://192.168.146.160:8088 （HTTPS，首次存取需在瀏覽器手動信任自簽憑證）

HTTP 入口：http://192.168.146.160:8089 會自動 301 轉址到上方 HTTPS 位址。

MongoDB 不對外暴露 port，如需直接連線除錯，請從宿主機進入容器：

docker exec -it work_tracker_mongo mongosh -u $MONGO_ROOT_USER -p

💾 資料持久化與備份

本專案已配置磁碟卷掛載（Volumes），MongoDB 資料會即時寫入宿主機的 ./mongo-data 資料夾，重新啟動或重新建置（Rebuild）容器時資料不會消失。

自動備份：執行 bash backup.sh 會以 mongodump 將整個 worktracker 資料庫匯出到 ./backups/backup_<時間戳>，並自動清除超過 30 天的舊備份。可加入 cron 排程定期執行。

⚙️ 系統服務說明

| 服務    | 說明                            | 對外埠口                          |
|---------|---------------------------------|-----------------------------------|
| app     | React 前端 (Nginx + HTTPS)      | 8088 (HTTPS) / 8089 (HTTP→轉址)   |
| backend | Express + Socket.io API         | 僅內部網路（不對外暴露 3001）     |
| mongo   | MongoDB 資料庫                  | 僅內部網路（不對外暴露 27017）    |

Nginx 反向代理規則：
- /api/* → backend:3001（REST API，要求 Authorization: Bearer <JWT>）
- /socket.io/* → backend:3001（WebSocket，連線握手需帶 JWT）

🔒 安全機制（ISO 27001 強化）

對應 commit「feat: ISO 27001 security hardening (R1/R2/R3/R4/R5/R8)」的實作：

- JWT 驗證：所有 /api/* 路由與 Socket.io 連線皆需有效的 Bearer Token（server/index.js）。
- HTTPS / TLS：Nginx 啟用 TLSv1.2 / TLSv1.3 + HIGH ciphers，HTTP 強制轉址至 HTTPS（nginx.conf）。
- CORS 白名單：後端 CORS 來源由 .env 的 CORS_ORIGIN 控制，非萬用字元。
- NoSQL 注入消毒：後端拒絕鍵名以 $ 開頭的請求 payload，並對字串長度做上限截斷（server/index.js sanitizeBody）。
- MongoDB 帳密保護：mongo 服務啟用 root 認證，憑證由 .env 注入；不對外暴露 27017 port。
- 自動備份：backup.sh 以 mongodump 進行整庫備份，含 30 天輪替清理。

尚未實作（後續評估）：
- HTTP security headers（Helmet）
- 速率限制（express-rate-limit）

📐 實作架構備註

下列功能在前端完成主要邏輯，後端僅提供通用 CRUD 端點（COLLECTIONS = ['tasks', 'logs', 'groups', 'tags']），未提供專屬 API：

- 例行任務複刻：前端 src/App.jsx 的 executeRecurrence() 在任務進度達 100% 時，呼叫通用 /api/tasks PATCH/POST 完成「結案 + 開啟下期」流程。
- 週報 / 月報：前端 src/App.jsx 的 reportData 直接以 /api/tasks 與 /api/logs 即時彙整顯示；後端並無 /api/reports 端點。
- 圖片壓縮：前端 src/App.jsx 的 compressImage() 以 canvas 將上傳影像縮至 1200px、JPEG 70% 品質後轉為 base64 字串上傳；後端不再加工，僅以 express.json({ limit: '50mb' }) 接收並儲存至 MongoDB（單一文件上限 16MB）。

⚠️ 注意事項

Tailwind 編譯：採用 v4 版本，src/index.css 使用 @import "tailwindcss"; 語法，並在 vite.config.js 透過 @tailwindcss/vite 啟用。

自簽憑證：瀏覽器首次存取 https://<IP>:8088 會出現「不安全」警告，需手動點選信任後才能繼續使用，這是自簽憑證的預期行為。

最後更新日期：2026-05-13
