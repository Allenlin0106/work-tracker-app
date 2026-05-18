const { models, toDoc } = require('../db');
const { logAudit } = require('../lib/audit');
const { writeFilter } = require('./crudService');

// 計算下一週期的 startDate / endDate；對應前端原 executeRecurrence 邏輯
// recurrenceType: 'daily' | 'weekly' | 'monthly'；recurrenceInterval: 數值倍數
const addInterval = (date, type, interval) => {
  const d = new Date(date);
  const n = Number(interval) || 1;
  if (type === 'daily') d.setDate(d.getDate() + n);
  else if (type === 'weekly') d.setDate(d.getDate() + 7 * n);
  else if (type === 'monthly') d.setMonth(d.getMonth() + n);
  return d.toISOString();
};

// 將 task 標為完成（progress=100）並建立下一週期的新 task；保持 owner 一致
// 不在 mongoose 交易內：本專案是 standalone mongo（無 replicaSet），交易會直接失敗
const recurTask = async (user, taskId) => {
  const filter = { _id: taskId, ...(await writeFilter('tasks', user)) };
  const current = await models.tasks.findOne(filter);
  if (!current) {
    const e = new Error('任務不存在或無權限');
    e.status = 404;
    throw e;
  }
  const cur = current.toObject();
  if (!cur.isRecurring) {
    const e = new Error('任務未啟用循環');
    e.status = 400;
    throw e;
  }

  // 標記目前任務完成
  current.set({ progress: 100 });
  await current.save();

  // 建立下一週期；複製欄位但清零進度與 checklist done 狀態
  const nextStart = cur.startDate ? addInterval(cur.startDate, cur.recurrenceType, cur.recurrenceInterval) : new Date().toISOString();
  const nextEnd = cur.endDate ? addInterval(cur.endDate, cur.recurrenceType, cur.recurrenceInterval) : nextStart;
  const nextChecklist = (cur.checklist || []).map(item => ({ ...item, done: false }));

  const next = await models.tasks.create({
    title: cur.title,
    assignee: cur.assignee || '',
    group: cur.group || '',
    tags: cur.tags || [],
    startDate: nextStart,
    endDate: nextEnd,
    progress: 0,
    isRecurring: true,
    recurrenceType: cur.recurrenceType,
    recurrenceInterval: cur.recurrenceInterval,
    attachments: cur.attachments || [],
    checklist: nextChecklist,
    owner: cur.owner,
  });

  logAudit('task.recur', user?.userId, { taskId, nextId: next._id.toString() });
  return { completed: toDoc(current), next: toDoc(next) };
};

module.exports = { recurTask };
