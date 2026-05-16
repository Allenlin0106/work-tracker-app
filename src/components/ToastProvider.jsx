// 統一 toast（FE-20）：取代散落的 setFormError / alert
// 提供 toast.success/error/info；自動 4 秒後消失
import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, X, Info } from 'lucide-react';

const ToastCtx = createContext(null);

let counter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind, message) => {
    const id = ++counter;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => remove(id), 4000);
  }, [remove]);

  const api = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastItem({ toast, onClose }) {
  const styles = {
    success: { Icon: CheckCircle2, cls: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
    error:   { Icon: AlertTriangle, cls: 'bg-rose-50 border-rose-200 text-rose-800' },
    info:    { Icon: Info, cls: 'bg-sky-50 border-sky-200 text-sky-800' },
  };
  const { Icon, cls } = styles[toast.kind] || styles.info;
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-2xl border-2 shadow-lg backdrop-blur-sm font-bold text-sm animate-in slide-in-from-right ${cls}`}>
      <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
      <div className="flex-1">{String(toast.message || '')}</div>
      <button onClick={onClose} className="opacity-50 hover:opacity-100">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    // 容錯：未包 Provider 時 fallback 到 console，避免 dev 期破畫面
    return { success: (m) => console.info(m), error: (m) => console.error(m), info: (m) => console.info(m) };
  }
  return ctx;
}
