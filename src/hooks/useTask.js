// useTask hook（FE-11）：封裝 apiPatch('tasks', ...) 重複呼叫
// 不引入全域狀態，僅提供穩定 callback 與簡單錯誤捕捉，避免破壞既有 socket 推送即時更新
import { useCallback } from 'react';
import { apiPatch } from '../lib/api';

export function useTask() {
  const update = useCallback(async (id, patch) => {
    const r = await apiPatch('tasks', id, patch);
    if (r && !r.ok && r.status >= 400) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${r.status}`);
    }
    return r;
  }, []);
  return { update };
}
