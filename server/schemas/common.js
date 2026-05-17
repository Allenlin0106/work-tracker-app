const { z } = require('zod');

// ObjectId 字串：24 hex char；mongoose 也接受寬鬆格式，這裡只做基本檢查
const objectIdString = z.string().regex(/^[a-fA-F0-9]{24}$/, 'invalid id');

// 容許 ISO date 字串或可被 Date.parse 的字串
const isoDateString = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'invalid date');

// 顏色 hex（#RGB / #RRGGBB / Tailwind class 等都允許），保守只限長度
const colorString = z.string().min(1).max(64);

// group / tag 既有資料把 color 存成 { label, bg, text, border, active } 物件（前端 Tailwind class），
// 同時允許單一字串以相容簡易場景；只限值型為 string 的單層 record，避免巢狀注入
const colorValue = z.union([
  colorString,
  z.record(z.string(), z.string().max(64)),
]);

module.exports = { objectIdString, isoDateString, colorString, colorValue };
