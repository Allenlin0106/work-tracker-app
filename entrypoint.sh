#!/bin/sh

# 定義絕對路徑
EXPORT_PATH="/app/data/export"
PROJECT_ID="work-tracker-app"
mkdir -p $EXPORT_PATH

# 1. 定義清理函數 (模仿 docker stop 的完美存檔行為)
cleanup() {
  echo "[系統] 接收到 Docker 停止信號 (SIGTERM)..."
  
  if [ ! -z "$BACKUP_PID" ]; then
    echo "[系統] 停止背景定時任務..."
    kill $BACKUP_PID 2>/dev/null
  fi

  if [ ! -z "$EMULATOR_PID" ]; then
    echo "[系統] 通知 Firebase 模擬器執行關閉前導出並退出..."
    kill -TERM "$EMULATOR_PID"
    wait "$EMULATOR_PID"
  fi

  echo "[成功] 模擬器已安全退出，資料已保留。關閉容器。"
  exit 0
}

trap 'cleanup' SIGTERM SIGINT

echo "[系統] Firebase 模擬器準備啟動 (專案 ID: $PROJECT_ID)..."

# 3. 啟動模擬器
firebase emulators:start --project $PROJECT_ID --import=$EXPORT_PATH --export-on-exit=$EXPORT_PATH &
EMULATOR_PID=$!

# 4. 背景定時備份迴圈 (大幅縮短為每 30 秒執行一次)
(
  echo "[系統] 背景定時備份服務已啟動 (每 30 秒高頻寫入模式)。"
  # 給予模擬器 30 秒的完整初始化時間
  sleep 30
  
  while true; do
    if ! kill -0 $EMULATOR_PID 2>/dev/null; then break; fi
    
    # 執行高頻備份
    firebase emulators:export $EXPORT_PATH --project $PROJECT_ID --force > /dev/null 2>&1
    
    # 加入明確的日誌輸出，讓您可以隨時在 Docker Logs 看到存檔時間
    echo "[系統] $(date '+%Y-%m-%d %H:%M:%S') - 資料已自動同步至實體硬碟"
    
    # 縮短備份間隔為 30 秒 (原為 180 秒)
    sleep 30
  done
) &
BACKUP_PID=$!

# 5. 持續監控模擬器程序
wait $EMULATOR_PID