Progress Hub - 部門工作進度追蹤平台

這是一個專為部門內部設計的工作進度追蹤系統。採用 React 構建前端介面，搭配 Tailwind CSS v4 提供現代化 UI，並使用 Firebase Emulator 在地端實現即時資料庫與身分驗證功能，最後透過 Docker 進行完整封裝與部署。

🚀 核心功能

工作項目管理：支援任務建立、編輯、刪除與進度追蹤。

雙視圖切換：

列表視圖：清晰呈現任務詳情與進度條。

甘特圖視圖：動態視覺化時程規劃，支援「日/週/月」三種縮放尺度，並具備子項展開功能。

自動化報表：提供週報與月報摘要，自動彙整近期完成的任務與日誌回報。

小組與人員管理：自定義執行小組配色，並具備常用負責人記憶功能。

例行任務複刻：支持循環任務（日/週/月）的一鍵結案並開啟下期功能。

全地端運行：所有資料儲存於本地實體硬碟，確保資料隱私與安全性。

🛠 系統架構與技術棧

前端框架：React 18 (Vite 5)

樣式系統：Tailwind CSS v4

後端服務：Firebase Local Emulator (Firestore & Auth)

部署環境：Docker Desktop (Docker Compose)

反向代理：Nginx (Alpine 版)

📁 專案資料夾結構

work-tracker-app/
├── src/
│   ├── App.jsx            # 主要程式邏輯 (包含 Firebase 初始化與 UI)
│   ├── main.jsx           # React 進入點
│   └── index.css          # Tailwind v4 全域樣式設定
├── firebase-data/         # (自動產生) Firebase 模擬器資料持久化目錄
├── Dockerfile.app         # 前端應用程式建置腳本 (Node 20 + Nginx)
├── Dockerfile.firebase    # Firebase 模擬器環境建置 (OpenJDK 21)
├── docker-compose.yml     # 容器編排配置文件
├── firebase.json          # Firebase 模擬器連接埠設定
├── database.rules         # Firestore 安全存取規則
├── package.json           # 專案依賴與版本管理
├── vite.config.js         # Vite 編譯設定 (含 Tailwind v4 插件)
└── index.html             # 基礎 HTML 範本


⚙️ 快速啟動步驟

1. 確認環境變數 (IP 位址)

專案目前預設連線 IP 為 192.168.146.160。若您的主機 IP 有變動，請更新以下位置：

src/App.jsx 中的 HOST_IP 常數。

docker-compose.yml 中的 extra_hosts (若有設定)。

2. 執行 Docker 建置與啟動

在專案根目錄開啟終端機，執行：

docker-compose up -d --build


3. 訪問服務

工作追蹤平台：http://192.168.146.160:8088

Firebase 管理後台：http://192.168.146.160:4000

💾 資料持久化說明

本專案已配置磁碟卷掛載（Volumes），Firebase 模擬器的資料會即時寫入宿主機的 ./firebase-data 資料夾。

重新啟動或重新建置（Rebuild）容器時，資料不會消失。

建議在進行重大系統維護前，先執行 docker-compose stop 確保模擬器完成最後一次資料導出。

⚠️ 注意事項

Java 版本：Firebase 模擬器容器已升級至 JDK 21，以符合最新版 firebase-tools 的運行要求。

Tailwind 編譯：由於採用 v4 版本，請確保 src/index.css 使用 @import "tailwindcss"; 語法，並在 Vite 設定中啟用 @tailwindcss/vite。

連接埠衝突：Firestore 模擬器內部使用 8080，外部映射為 8081。若網頁出現權限或連線錯誤，請確認宿主機 8081 埠口未被佔用。

最後更新日期：2026-03-09