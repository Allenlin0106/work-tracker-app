// 任務狀態判斷純業務邏輯（FE-2）
// UI 樣式（color / Icon）混在這裡是歷史遺留，未拆是因為 App.jsx 多處直接消費；
// 拆 UI 會牽動 ~10 個 callsite，留待後續 page 拆解時一起處理
import { CheckCircle2, AlertTriangle, AlertCircle, Clock } from 'lucide-react';
import { toLocalMidnight } from './dateUtils';

export const getTaskStatus = (task, allLogs = []) => {
  if (!task) {
    return { label: '未知', color: 'bg-slate-100 text-slate-400 border-slate-200', Icon: Clock, value: 'unknown' };
  }
  const today = toLocalMidnight(new Date());
  const end = toLocalMidnight(task.endDate);

  if (task.progress >= 100) {
    return { label: '已完成', color: 'bg-emerald-50 text-emerald-600 border-emerald-100', Icon: CheckCircle2, value: 'done' };
  }
  if (end < today) {
    return { label: '已逾期', color: 'bg-rose-50 text-rose-600 border-rose-100', Icon: AlertTriangle, value: 'delayed' };
  }

  const hasCompletedChecklist = (task.checklist || []).some(item => item.completed);
  const hasLogs = allLogs.some(log => log.taskId === task.id);

  if (task.progress > 0 || hasCompletedChecklist || hasLogs) {
    return { label: '進行中', color: 'bg-blue-50 text-blue-600 border-blue-100', Icon: AlertCircle, value: 'doing' };
  }
  return { label: '未開始', color: 'bg-slate-100 text-slate-500 border-slate-200', Icon: Clock, value: 'todo' };
};

export const checkIsCurrent = (unitDate, scale) => {
  const now = new Date();
  if (scale === 'day') return unitDate.toDateString() === now.toDateString();
  if (scale === 'week') {
    const e = new Date(unitDate);
    e.setDate(unitDate.getDate() + 7);
    return now >= unitDate && now < e;
  }
  return unitDate.getMonth() === now.getMonth() && unitDate.getFullYear() === now.getFullYear();
};

// assigneeData 內每一個 entry 若能在 usersById 對到帳號 → 顯示 username；
// 對不到的視為舊資料（任意人名字串），原樣顯示
export const displayAssignee = (assigneeData, usersById) => {
  const arr = Array.isArray(assigneeData) ? assigneeData : (assigneeData ? [assigneeData] : []);
  if (arr.length === 0) return '未指派';
  return arr.map(v => (usersById && usersById.get(v)?.username) || String(v)).join('、');
};
