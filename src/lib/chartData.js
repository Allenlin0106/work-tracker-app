import { getTaskStatus } from './taskStatus';
import { formatDate } from './dateUtils';

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
    const updated = t.updatedAt ? new Date(t.updatedAt) : null;
    const done = isDone(t);
    buckets.forEach(b => {
      if (created && created >= b.start && created < b.end) b.created += 1;
      if (done && updated && updated >= b.start && updated < b.end) b.completed += 1;
    });
  });

  return buckets.map(b => ({ week: b.label, created: b.created, completed: b.completed }));
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
