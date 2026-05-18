const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // 只計失敗請求；合法切換帳號不被擋。暴力破解仍受 per-account lockout（auth.js）+ IP 失敗 5 次/15 分 雙層保護
  skipSuccessfulRequests: true,
  message: { error: 'Too many attempts, please retry later' },
});

const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded' },
});

module.exports = { authLimiter, apiLimiter };
