// 統一輸入框（FE-9）：取代 App.jsx 中 8+ 處重複的 80+ char Tailwind class
// 接受 forwardRef 以便表單聚焦控制
import React, { forwardRef } from 'react';

const baseClass =
  'w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-white text-sm font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-medium focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all';

const TextField = forwardRef(function TextField(
  { as = 'input', className = '', error, label, hint, ...rest },
  ref
) {
  const Component = as;
  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-black text-slate-600 mb-2 tracking-wider uppercase">{label}</label>
      )}
      <Component
        ref={ref}
        className={`${baseClass} ${error ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-100' : ''} ${className}`}
        {...rest}
      />
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-xs font-bold text-rose-500">{error}</p>}
    </div>
  );
});

export default TextField;
