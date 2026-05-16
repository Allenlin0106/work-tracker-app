// 統一 spinner（FE-10）：取代 App.jsx 中 13 處 Loader2 散落用法
// size 對齊 lucide-react Icon 慣例（w-/h- Tailwind class）
import React from 'react';
import { Loader2 } from 'lucide-react';

export default function Spinner({ size = 'w-4 h-4', className = '' }) {
  return <Loader2 className={`${size} animate-spin ${className}`} />;
}
