const { URL_FIELD_KEYS, isSafeUrl } = require('./security');

// data: URL → 解析出 declared mime + base64 payload
const parseDataUrl = (s) => {
  if (typeof s !== 'string' || !s.startsWith('data:')) return null;
  const m = /^data:([^;,]+)(?:;base64)?,(.*)$/.exec(s);
  if (!m) return null;
  return { mime: m[1].toLowerCase(), payload: m[2] };
};

// 影像 magic bytes 對照（BE-7）：避免攻擊者上傳 SVG / HTML 卻宣告 image/png
// 只支援前端 compressImage 會輸出的格式：png / jpeg / webp / gif
const IMAGE_MAGIC = [
  { mime: 'image/png',  bytes: [0x89, 0x50, 0x4E, 0x47] },
  { mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, then: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] } },
  { mime: 'image/gif',  bytes: [0x47, 0x49, 0x46, 0x38] },
];

const matchesMagic = (buf, def) => {
  for (let i = 0; i < def.bytes.length; i++) {
    if (buf[i] !== def.bytes[i]) return false;
  }
  if (def.then) {
    for (let i = 0; i < def.then.bytes.length; i++) {
      if (buf[def.then.offset + i] !== def.then.bytes[i]) return false;
    }
  }
  return true;
};

// 回傳 true 表示 data: URL 是合法影像（mime 宣告與 magic bytes 一致）
// 非 data: URL 直接 true（由 isSafeUrl 把關協定）
const isValidImageDataUrl = (s) => {
  const parsed = parseDataUrl(s);
  if (!parsed) return true;
  if (!parsed.mime.startsWith('image/')) return false;
  // 拒絕 svg / xml：靠 mime 即可阻擋（沒有對應的 magic）
  if (parsed.mime === 'image/svg+xml') return false;
  let buf;
  try { buf = Buffer.from(parsed.payload, 'base64'); }
  catch { return false; }
  if (buf.length < 12) return false;
  return IMAGE_MAGIC.some(def => def.mime === parsed.mime && matchesMagic(buf, def));
};

// 清理請求 body：拒絕 $ 開頭 key、限制字串長度、url 類欄位走協定白名單；
// 對 data:image/* 額外做 magic bytes 驗證（BE-7）
const sanitizeBody = (obj, maxLen = 5_000_000) => {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return obj;
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('$')) continue;
    if (typeof v === 'string') {
      const trimmedVal = v.length > maxLen ? v.slice(0, maxLen) : v;
      if (URL_FIELD_KEYS.has(k)) {
        if (!isSafeUrl(trimmedVal)) {
          clean[k] = '';
        } else if (trimmedVal.startsWith('data:') && !isValidImageDataUrl(trimmedVal)) {
          // 宣告 data: 但非合法 image：直接清掉，避免 SVG / HTML 注入
          clean[k] = '';
        } else {
          clean[k] = trimmedVal;
        }
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

module.exports = { sanitizeBody, isValidImageDataUrl };
