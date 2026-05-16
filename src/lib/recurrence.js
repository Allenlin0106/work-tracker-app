// 循環任務（FE-4）：呼叫後端 BE-5 domain endpoint /api/tasks/:id/recur
// 後端負責標記目前任務完成 + 建立下一週期 task；前端不再自行算下一日期
import { getToken } from './api';

const apiBase = '/api';

export const callRecurTask = async (taskId) => {
  const r = await fetch(`${apiBase}/tasks/${taskId}/recur`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
};
