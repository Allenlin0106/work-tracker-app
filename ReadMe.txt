Progress Hub - 部門工作進度追蹤平台

🛠 系統架構與技術棧

前端框架：React 18 (Vite 5)
樣式系統：Tailwind CSS v4
後端服務：ASP.NET Core Web API (.NET 8) + SignalR
資料庫：Microsoft SQL Server（外部，需事先建立 worktracker 資料庫）
本機開發：Visual Studio 2022 + IIS Express（後端）/ Vite Dev Server（前端）
正式部署：Docker + Nginx（前端靜態服務 + 反向代理）

🚀 核心功能

工作項目管理：支援任務建立、編輯、刪除與進度追蹤。

雙視圖切換：
  列表視圖：清晰呈現任務詳情與進度條。
  甘特圖視圖：動態視覺化時程規劃，支援「日/週/月」三種縮放尺度。

自動化報表：週報與月報摘要，自動彙整近期完成的任務與日誌回報。

小組與人員管理：自定義執行小組配色，常用負責人記憶功能。

例行任務複刻：循環任務（日/週/月）一鍵結案並開啟下期。

即時同步：任何一方的操作（新增/修改/刪除）均透過 SignalR WebSocket 即時推送至所有連線用戶。

📁 專案資料夾結構

work-tracker-app/
├── backend/                       # ASP.NET Core 後端
│   ├── WorkTracker.sln
│   └── WorkTracker/
│       ├── Controllers/           # AuthController、DataController
│       ├── Hubs/TrackerHub.cs     # SignalR Hub
│       ├── Services/              # DbService、EncryptionService
│       ├── Models/JwtOptions.cs
│       ├── Program.cs
│       ├── appsettings.json
│       └── appsettings.Development.json
├── src/
│   ├── App.jsx                    # React 主元件（SignalR + REST API）
│   ├── main.jsx
│   └── index.css
├── scripts/
│   └── encrypt-secret.js          # AES-256-CBC 密文產生工具
├── secrets/
│   └── encryption_key.txt         # 加密金鑰（不進 git）
├── certs/                         # SSL 憑證（不進 git）
├── Dockerfile.app                  # 前端建置（Node 20 → Nginx）
├── docker-compose.yml              # 容器編排（目前僅前端）
├── nginx.conf                      # Nginx 反向代理設定
├── package.json
└── vite.config.js

⚙️ 本機開發啟動

步驟 1：設定後端連線（backend/WorkTracker/appsettings.Development.json）

  {
    "App": {
      "SqlServer": "your-sql-server-ip",
      "SqlUser": "wt_user",
      "SqlPassword": "your-password",
      "JwtSecret": "dev-secret"
    }
  }

  或使用加密憑證：
    1. node scripts/encrypt-secret.js  ← 加密 SQL 密碼
    2. 將密文填入 EncryptedSqlPassword（appsettings.Development.json）
    3. 確認 secrets/encryption_key.txt 存在

步驟 2：啟動後端
  Visual Studio 2022：開啟 backend/WorkTracker.sln → F5（IIS Express，HTTPS :7180）
  或 CLI：cd backend && dotnet run

步驟 3：啟動前端
  npm run dev
  開啟 http://localhost:5173

🔒 正式部署（前端）

  1. 建立 certs/server.crt 與 certs/server.key（參考 certs/gen-cert.sh）
  2. docker-compose up -d --build
  3. 訪問 https://<主機IP>:8088

⚠️ 注意：ASP.NET Core 後端正式部署需另建 Dockerfile（FROM mcr.microsoft.com/dotnet/aspnet:8.0）

最後更新日期：2026-05-08
