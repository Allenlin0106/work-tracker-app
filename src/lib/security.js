// URL 協定白名單：阻擋 javascript:/data:/file: 等可造成 XSS 的協定。
// data:image/... 為前端 compressImage 產出的影像，允許。
export const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export const isSafeUrl = (str) => {
  if (typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('data:image/')) return true;
  try {
    return SAFE_URL_PROTOCOLS.has(new URL(trimmed).protocol);
  } catch {
    return false;
  }
};

// 密碼強度規則：>=12 字、含大寫/小寫/數字（與後端一致）
export const PASSWORD_HINT = '密碼至少 12 字元，需包含大寫、小寫、數字';
export const isStrongPassword = (pw) =>
  typeof pw === 'string' && pw.length >= 12 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);
