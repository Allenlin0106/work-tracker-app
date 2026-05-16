// 顏色選擇器（FE-8）：取代 Tag/Group modal 內幾乎相同的 swatch grid
// options 形如 [{ label, bg, text, border, active }]，與 App.jsx 既有 GROUP/TAG_COLOR_OPTIONS 對齊
import React from 'react';
import { Check } from 'lucide-react';

export default function ColorPicker({ options, value, onChange, columns = 6 }) {
  const isActive = (opt) => value && value.label === opt.label;
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => (
        <button
          key={opt.label}
          type="button"
          onClick={() => onChange(opt)}
          className={`relative h-10 rounded-xl border-2 transition-all active:scale-95 ${opt.active} ${
            isActive(opt) ? 'ring-2 ring-offset-2 ring-slate-900 border-white' : 'border-transparent opacity-90 hover:opacity-100'
          }`}
          aria-label={opt.label}
          title={opt.label}
        >
          {isActive(opt) && <Check className="w-4 h-4 text-white absolute inset-0 m-auto" />}
        </button>
      ))}
    </div>
  );
}
