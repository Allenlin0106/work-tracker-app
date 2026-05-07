Progress Hub - 部門工作進度追蹤平台

這是一個專為部門內部設計的工作進度追蹤系統。採用 React 構建前端介面，搭配 Tailwind CSS v4 提供現代化 UI，並使用 Express.js + MongoDB 提供後端 API 與即時推送（Socket.io），透過 Docker Compose 進行完整封裝與部署。

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

反向代理：Nginx (Alpine 版)

📁 專案資料夾結構

work-tracker-app/
├── src/
│   ├── App.jsx            # 主要程式邏輯 (Socket.io + REST API)
│   ├── main.jsx           # React 進入點
│   └── index.css          # Tailwind v4 全域樣式設定
├── server/
│   ├── index.js           # Express + Socket.io + Mongoose 後端
│   └── package.json       # 後端依賴
├── mongo-data/            # (自動產生) MongoDB 資料持久化目錄
├── Dockerfile.app         # 前端應用程式建置腳本 (Node 20 + Nginx)
├── Dockerfile.backend     # 後端伺服器建置腳本 (Node 20)
├── docker-compose.yml     # 容器編排配置文件
├── nginx.conf             # Nginx 反向代理設定
├── package.json           # 前端依賴與版本管理
├── vite.config.js         # Vite 編譯設定
└── index.html             # 基礎 HTML 範本


⚙️ 快速啟動步驟

1. 確認環境變數 (IP 位址)

專案目前預設連線 IP 為 192.168.146.160。若您的主機 IP 有變動，請更新以下位置：

docker-compose.yml 中的 extra_hosts（若有設定）。

2. 執行 Docker 建置與啟動

在專案根目錄開啟終端機，執行：

docker-compose up -d --build


3. 訪問服務

工作追蹤平台：http://192.168.146.160:8088

MongoDB（如需直接連線）：mongodb://192.168.146.160:27017/worktracker

💾 資料持久化說明

本專案已配置磁碟卷掛載（Volumes），MongoDB 資料會即時寫入宿主機的 ./mongo-data 資料夾。

重新啟動或重新建置（Rebuild）容器時，資料不會消失。

⚙️ 系統服務說明

| 服務 | 說明 | 對外埠口 |
|------|------|---------|
| app | React 前端 (Nginx) | 8088 |
| backend | Express + Socket.io API | 3001 |
| mongo | MongoDB 資料庫 | 27017 |

Nginx 反向代理規則：
- /api/* → backend:3001（REST API）
- /socket.io/* → backend:3001（WebSocket）

⚠️ 注意事項

Tailwind 編譯：由於採用 v4 版本，請確保 src/index.css 使用 @import "tailwindcss"; 語法，並在 Vite 設定中啟用 @tailwindcss/vite。

大型附件：圖片上傳前會自動壓縮至 1200px / 70% JPEG 品質，儲存為 base64 字串於 MongoDB（文件上限 16MB）。

最後更新日期：2026-05-07
