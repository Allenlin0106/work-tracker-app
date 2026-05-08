#!/bin/bash
# MongoDB 備份腳本
# 依賴：.env 中的 MONGO_ROOT_USER / MONGO_ROOT_PASS 環境變數
# 建議設定 cron：0 2 * * * /path/to/backup.sh >> /var/log/wt-backup.log 2>&1

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

if [ -f "${ENV_FILE}" ]; then
  export $(grep -v '^#' "${ENV_FILE}" | xargs)
fi

if [ -z "${MONGO_ROOT_USER}" ] || [ -z "${MONGO_ROOT_PASS}" ]; then
  echo "[ERROR] 請在 .env 中設定 MONGO_ROOT_USER 與 MONGO_ROOT_PASS"
  exit 1
fi

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${SCRIPT_DIR}/backups/backup_${DATE}"
CONTAINER_PATH="/tmp/wt_backup_${DATE}"

echo "[$(date)] 開始備份..."

docker exec work_tracker_mongo mongodump \
  --username "${MONGO_ROOT_USER}" \
  --password "${MONGO_ROOT_PASS}" \
  --authenticationDatabase admin \
  --db worktracker \
  --out "${CONTAINER_PATH}"

mkdir -p "${SCRIPT_DIR}/backups"
docker cp "work_tracker_mongo:${CONTAINER_PATH}" "${BACKUP_DIR}"
docker exec work_tracker_mongo rm -rf "${CONTAINER_PATH}"

echo "[$(date)] 備份完成：${BACKUP_DIR}"

# 保留最近 30 份，自動刪除舊備份
find "${SCRIPT_DIR}/backups" -maxdepth 1 -name "backup_*" -type d | sort | head -n -30 | xargs -r rm -rf
echo "[$(date)] 舊備份清理完成（保留最近 30 份）"
