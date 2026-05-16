// 報表資料（FE-5）：呼叫後端 BE-4 domain endpoint /api/reports
// 回傳結構與舊 useMemo reportData 一致：[{ task, taskLogs, taskChecklistActivity }]
//
// 注意：search / sort / status 等前端額外過濾仍由 caller 套用，避免雙寫
import { getToken } from './api';

const apiBase = '/api';

const toIso = (d) => {
  if (d instanceof Date) return d.toISOString();
  return new Date(d).toISOString();
};

export const fetchReport = async ({ start, end, hideTagged = false }) => {
  const params = new URLSearchParams({
    start: toIso(start),
    end: toIso(end),
    hideTagged: String(hideTagged),
  });
  const r = await fetch(`${apiBase}/reports?${params.toString()}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
};
