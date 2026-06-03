import { getTaskStatus } from './taskStatus';
import { formatDate, toLocalMidnight } from './dateUtils';

const isDone = (t) => (t.progress ?? 0) >= 100;

export const buildGroupWorkload = (tasks, groups) => {
  return groups
    .map(g => {
      const groupTasks = tasks.filter(t => t.group === g.name);
      const done = groupTasks.filter(isDone).length;
      return { group: g.name, total: groupTasks.length, done };
    })
    .filter(d => d.total > 0);
};

// 週首採週一（避免跨地區語系差異），時間以 local midnight 為界
const startOfWeek = (d) => {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
};

export const buildWeeklyProgress = (tasks, weeks = 12) => {
  const thisWeekStart = startOfWeek(new Date());
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = new Date(thisWeekStart);
    ws.setDate(thisWeekStart.getDate() - i * 7);
    const we = new Date(ws);
    we.setDate(ws.getDate() + 7);
    buckets.push({ start: ws, end: we, label: formatDate(ws), created: 0, completed: 0 });
  }

  tasks.forEach(t => {
    const created = t.createdAt ? new Date(t.createdAt) : null;
    // 優先用後端寫入的 completedAt；舊資料無此欄位則 fallback updatedAt（行為等同改動前）
    const completedSource = t.completedAt ?? t.updatedAt;
    const completed = completedSource ? new Date(completedSource) : null;
    const done = isDone(t);
    buckets.forEach(b => {
      if (created && created >= b.start && created < b.end) b.created += 1;
      if (done && completed && completed >= b.start && completed < b.end) b.completed += 1;
    });
  });

  return buckets.map(b => ({ week: b.label, created: b.created, completed: b.completed }));
};

const STATUS_BREAKDOWN_ORDER = [
  { key: 'done', label: '已完成', color: '#10b981' },
  { key: 'doing', label: '進行中', color: '#3b82f6' },
  { key: 'delayed', label: '已逾期', color: '#f43f5e' },
  { key: 'todo', label: '未開始', color: '#94a3b8' },
];

export const buildStatusBreakdown = (tasks, logs) => {
  const counts = { done: 0, doing: 0, delayed: 0, todo: 0 };
  tasks.forEach(t => {
    const v = getTaskStatus(t, logs).value;
    const bucket = v === 'unknown' ? 'todo' : v;
    if (counts[bucket] != null) counts[bucket] += 1;
  });
  return STATUS_BREAKDOWN_ORDER.map(s => ({ ...s, count: counts[s.key] }));
};

const DAY_MS = 86400000;

export const buildUpcomingDeadlines = (tasks, logs) => {
  const today = toLocalMidnight(new Date());
  const buckets = [
    { window: '已逾期', count: 0 },
    { window: '7 天內', count: 0 },
    { window: '8–14 天', count: 0 },
    { window: '15–30 天', count: 0 },
  ];
  tasks.forEach(t => {
    if ((t.progress ?? 0) >= 100) return;
    if (!t.endDate) return;
    const end = toLocalMidnight(t.endDate);
    if (Number.isNaN(end?.getTime())) return;
    const diff = Math.round((end - today) / DAY_MS);
    if (diff < 0) buckets[0].count += 1;
    else if (diff <= 7) buckets[1].count += 1;
    else if (diff <= 14) buckets[2].count += 1;
    else if (diff <= 30) buckets[3].count += 1;
  });
  return buckets;
};

export const buildAssigneeWorkload = (tasks, logs, usersById) => {
  const counts = new Map();
  tasks.forEach(t => {
    if (getTaskStatus(t, logs).value !== 'doing') return;
    const arr = Array.isArray(t.assignee) ? t.assignee : (t.assignee ? [t.assignee] : []);
    if (arr.length === 0) {
      counts.set('未指派', (counts.get('未指派') || 0) + 1);
      return;
    }
    arr.forEach(uid => {
      const name = usersById?.get(uid)?.username || String(uid);
      counts.set(name, (counts.get(name) || 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .map(([name, doing]) => ({ name, doing }))
    .sort((a, b) => b.doing - a.doing);
};
