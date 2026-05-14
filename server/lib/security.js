// URL 協定白名單：附件 / 連結欄位僅允許下列協定，阻擋 javascript:/file:/vbscript: 等
const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const URL_FIELD_KEYS = new Set(['url', 'link', 'href']);

const isSafeUrl = (str) => {
  if (typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (!trimmed) return false;
  // 允許前端 compressImage 產出的 data:image/... 影像
  if (trimmed.startsWith('data:image/')) return true;
  try {
    return SAFE_URL_PROTOCOLS.has(new URL(trimmed).protocol);
  } catch {
    return false;
  }
};

// 密碼強度規則：>=12 字、需含大寫/小寫/數字
const PASSWORD_RULE_MSG = '密碼至少 12 字元，需包含大寫、小寫、數字';
const validatePassword = (pw) =>
  typeof pw === 'string' && pw.length >= 12 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);

module.exports = {
  SAFE_URL_PROTOCOLS,
  URL_FIELD_KEYS,
  isSafeUrl,
  PASSWORD_RULE_MSG,
  validatePassword,
};
