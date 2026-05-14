import React, { useMemo, useState } from 'react';
import { Search, Filter, FileText, Calendar } from 'lucide-react';

const fmtDate = (d) => {
  if (!d) return '';
  try { return new Date(d).toLocaleString(); } catch { return String(d); }
};

const toDayStart = (s) => {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00');
  return isNaN(d) ? null : d;
};
const toDayEnd = (s) => {
  if (!s) return null;
  const d = new Date(s + 'T23:59:59.999');
  return isNaN(d) ? null : d;
};

export default function LogsQueryPage({ logs, tasks }) {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [taskId, setTaskId] = useState('');
  const [keyword, setKeyword] = useState('');

  const taskById = useMemo(() => {
    const m = new Map();
    tasks.forEach(t => m.set(t.id, t));
    return m;
  }, [tasks]);

  const filtered = useMemo(() => {
    const fromD = toDayStart(from);
    const toD = toDayEnd(to);
    const kw = keyword.trim().toLowerCase();

    return logs
      .filter(l => {
        const ts = l.timestamp ? new Date(l.timestamp) : null;
        if (fromD && ts && ts < fromD) return false;
        if (toD && ts && ts > toD) return false;
        if (taskId && l.taskId !== taskId) return false;
        if (kw) {
          const text = String(l.text || '').toLowerCase();
          const taskTitle = String(taskById.get(l.taskId)?.title || '').toLowerCase();
          if (!text.includes(kw) && !taskTitle.includes(kw)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  }, [logs, from, to, taskId, keyword, taskById]);

  const reset = () => {
    setFrom(weekAgo);
    setTo(today);
    setTaskId('');
    setKeyword('');
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3">
        <FileText className="w-7 h-7 text-indigo-600" />
        <h2 className="text-2xl font-black text-slate-800">工作日誌查詢</h2>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <label className="block">
            <span className="block text-xs font-bold text-slate-600 mb-1">起始日</span>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-slate-600 mb-1">結束日</span>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-slate-600 mb-1">所屬任務</span>
            <select
              value={taskId}
              onChange={e => setTaskId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">全部</option>
              {tasks.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </label>
          <label className="block md:col-span-1">
            <span className="block text-xs font-bold text-slate-600 mb-1">關鍵字（內容或任務名稱）</span>
            <div className="flex items-center border border-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500">
              <Search className="w-4 h-4 text-slate-400 mr-2" />
              <input
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                className="flex-1 text-sm outline-none bg-transparent"
                placeholder="輸入關鍵字..."
              />
            </div>
          </label>
          <button
            onClick={reset}
            className="bg-slate-100 text-slate-600 rounded-xl py-2 text-sm font-bold hover:bg-slate-200 inline-flex items-center justify-center gap-2"
          >
            <Filter className="w-4 h-4" /> 重設
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-black text-slate-700 inline-flex items-center gap-2">
            <Calendar className="w-4 h-4" /> 結果（{filtered.length} 筆）
          </h3>
        </div>
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">無符合條件的日誌</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs">
              <tr>
                <th className="text-left px-5 py-3 font-bold w-44">時間</th>
                <th className="text-left px-5 py-3 font-bold w-64">所屬任務</th>
                <th className="text-left px-5 py-3 font-bold">內容</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50/50 align-top">
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{fmtDate(l.timestamp)}</td>
                  <td className="px-5 py-3 text-slate-700 font-bold truncate">{taskById.get(l.taskId)?.title || <span className="text-slate-400 italic">（已刪除任務）</span>}</td>
                  <td className="px-5 py-3 text-slate-700 whitespace-pre-wrap break-words">{String(l.text || '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
