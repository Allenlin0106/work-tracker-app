const { URL_FIELD_KEYS, isSafeUrl } = require('./security');

// 清理請求 body：拒絕 $ 開頭 key、限制字串長度、url 類欄位走協定白名單
const sanitizeBody = (obj, maxLen = 5000) => {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return obj;
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('$')) continue;
    if (typeof v === 'string') {
      const trimmedVal = v.length > maxLen ? v.slice(0, maxLen) : v;
      if (URL_FIELD_KEYS.has(k) && !isSafeUrl(trimmedVal)) {
        clean[k] = '';
      } else {
        clean[k] = trimmedVal;
      }
    } else if (Array.isArray(v)) {
      clean[k] = v.map(item => (typeof item === 'object' ? sanitizeBody(item, maxLen) : item));
    } else if (typeof v === 'object' && v !== null) {
      clean[k] = sanitizeBody(v, maxLen);
    } else {
      clean[k] = v;
    }
  }
  return clean;
};

module.exports = { sanitizeBody };
