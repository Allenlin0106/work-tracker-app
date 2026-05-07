#!/bin/bash
# 產生自簽 SSL 憑證（有效期 10 年）
# 用法：bash certs/gen-cert.sh [主機IP]
# 範例：bash certs/gen-cert.sh 192.168.146.160

set -e
IP=${1:-192.168.146.160}
CERT_DIR="$(cd "$(dirname "$0")" && pwd)"

openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout "${CERT_DIR}/server.key" \
  -out "${CERT_DIR}/server.crt" \
  -subj "/CN=${IP}" \
  -addext "subjectAltName=IP:${IP}"

chmod 600 "${CERT_DIR}/server.key"
echo "✓ 憑證已產生："
echo "  ${CERT_DIR}/server.crt"
echo "  ${CERT_DIR}/server.key"
echo ""
echo "提示：首次在瀏覽器存取 https://${IP}:8088 時，需手動信任此自簽憑證。"
