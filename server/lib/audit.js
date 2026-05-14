// 稽核日誌：以 stdout 輸出一行 JSON（由 docker logs 收集）
const logAudit = (event, userId, meta = {}) => {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    event,
    userId: userId || null,
    ...meta,
  }));
};

module.exports = { logAudit };
