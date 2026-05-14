// 環境變數驗證：缺失或不符規即拒絕啟動（fail-closed）
const requireEnv = (name, { minLen = 0 } = {}) => {
  const v = process.env[name];
  if (!v || v.length < minLen) {
    console.error(`[Config] ${name} is required${minLen ? ` (>=${minLen} chars)` : ''}. Refusing to start.`);
    process.exit(1);
  }
  return v;
};

module.exports = {
  JWT_SECRET: requireEnv('JWT_SECRET', { minLen: 32 }),
  CORS_ORIGIN: requireEnv('CORS_ORIGIN'),
  MONGO_URI: requireEnv('MONGO_URI'),
  PORT: process.env.PORT || 3001,
};
