const { models } = require('../db');
const { readFilter } = require('./crudService');
const { z } = require('zod');
const { isoDateString } = require('../schemas/common');

// 報表 query 驗證
const reportQuerySchema = z.object({
  start: isoDateString,
  end: isoDateString,
  hideTagged: z.union([z.boolean(), z.string()]).optional(),
});

const toLocalMidnight = (s) => {
  const d = new Date(s);
  d.setHours(0, 0, 0, 0);
  return d;
};

// 後端版 reportData：以 start / end 篩選任務內 log / checklist 完成項；
// 結構與前端 src/App.jsx:501-523 reportData 一致：[{ task, taskLogs, taskChecklistActivity }]
// 額外搜尋 / 排序 / 狀態過濾仍由前端處理（避免雙寫）
const buildReport = async (user, query) => {
  const parsed = reportQuerySchema.safeParse(query);
  if (!parsed.success) {
    const e = new Error(parsed.error.issues?.[0]?.message || 'invalid query');
    e.status = 400;
    throw e;
  }
  const start = new Date(parsed.data.start);
  const end = new Date(parsed.data.end);
  end.setHours(23, 59, 59, 999);
  const hideTagged = parsed.data.hideTagged === true || parsed.data.hideTagged === 'true' || parsed.data.hideTagged === '1';

  const taskFilter = readFilter('tasks', user);
  const logFilter = readFilter('logs', user);

  const [tasks, logs] = await Promise.all([
    models.tasks.find(taskFilter).lean(),
    models.logs.find(logFilter).lean(),
  ]);

  const stripId = (d) => {
    const o = { ...d, id: d._id.toString() };
    delete o._id; delete o.__v;
    return o;
  };

  const result = [];
  for (const raw of tasks) {
    const t = stripId(raw);
    if (hideTagged && Array.isArray(t.tags) && t.tags.length > 0) continue;

    const taskLogs = logs
      .filter(l => l.taskId === t.id)
      .map(stripId)
      .filter(l => {
        const d = l.timestamp ? new Date(l.timestamp) : new Date();
        return d >= start && d <= end;
      })
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    const taskChecklistActivity = (t.checklist || []).filter(i => {
      if (!i.completed || !i.actualDoneDate) return false;
      const d = toLocalMidnight(String(i.actualDoneDate).split(' ')[0]);
      return d >= start && d <= end;
    });

    if (taskLogs.length === 0 && taskChecklistActivity.length === 0) continue;
    result.push({ task: t, taskLogs, taskChecklistActivity });
  }
  return result;
};

module.exports = { buildReport };
