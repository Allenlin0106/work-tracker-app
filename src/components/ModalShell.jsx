// 通用 Modal 殼層（FE-7）：backdrop + container + close + ESC + click-outside
// FE-19 a11y（role/aria/focus trap）尚未加上；待後續迭代
import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export default function ModalShell({ isOpen, onClose, children, maxWidth = 'max-w-lg', title }) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-[2rem] shadow-2xl w-full ${maxWidth} max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 shadow-slate-900/50`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || onClose) && (
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-100">
            {title && <h2 className="text-lg font-black text-slate-900 tracking-tight">{title}</h2>}
            {onClose && (
              <button
                onClick={onClose}
                className="ml-auto w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors"
                aria-label="關閉"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
