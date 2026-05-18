const { models, COLLECTIONS, toDoc, stripDoc } = require('../db');
const { sanitizeBody } = require('../lib/sanitize');
const { logAudit } = require('../lib/audit');
const { schemas } = require('../schemas');

// 須做 ownership 過濾的 collections（個人資料）
// groups / tags 為共享的設定資料，不過濾
const OWNED_COLLECTIONS = new Set(['tasks', 'logs']);

// 權限規則：
//   task 讀：所有登入者皆可（無 ownership 過濾）
//   task 寫：admin / assignee.includes(self)
//   log  讀：所有登入者皆可（同 task）
//   log  寫：跟著關聯 task 的寫權限走（admin / assignee.includes(self) 對應的 task）
const taskReadQuery = (/* user */) => ({});
const taskWriteQuery = (user) => {
  if (user?.role === 'admin') return {};
  return { assignee: user.userId };
};

// readFilter / writeFilter 為 async：write 場景的 logs 需先查 user 可寫的 task ids
const readFilter = async (/* col, user */) => ({});  // task / log 全部開放閱讀
const writeFilter = async (col, user) => {
  if (col === 'tasks') return taskWriteQuery(user);
  if (col === 'logs') {
    if (user?.role === 'admin') return {};
    const tasks = await models.tasks.find(taskWriteQuery(user), { _id: 1 }).lean();
    return { taskId: { $in: tasks.map(t => t._id.toString()) } };
  }
  return {};
};

const isOwned = (col) => OWNED_COLLECTIONS.has(col);

// Zod 驗證錯誤統一格式：取第一個 issue 訊息
const toValidationError = (zerr) => {
  const first = zerr.issues?.[0];
  const path = first?.path?.join('.') || '';
  return path ? `${path}: ${first.message}` : (first?.message || 'invalid input');
};

// 共用 list / create / update / delete；回傳 plain object，由 route 包成 res.json
// 廣播以 broadcastChange(col, op, doc) 形式呼叫，由 sockets.js 注入
const buildCrudService = (broadcastChange) => {
  const assertCollection = (col) => {
    if (!COLLECTIONS.includes(col)) {
      const e = new Error(`unknown collection: ${col}`);
      e.status = 400;
      throw e;
    }
  };

  const list = async (col, user) => {
    assertCollection(col);
    const docs = await models[col].find(await readFilter(col, user)).lean();
    return docs.map(stripDoc);
  };

  const create = async (col, user, rawBody) => {
    assertCollection(col);
    const body = sanitizeBody(rawBody);
    const schema = schemas[col]?.create;
    if (schema) {
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        const e = new Error(toValidationError(parsed.error));
        e.status = 400;
        throw e;
      }
      Object.assign(body, parsed.data);
    }
    if (isOwned(col)) body.owner = user.userId;
    const doc = await models[col].create(body);
    logAudit('crud.create', user?.userId, { col, docId: doc._id.toString() });
    const dto = toDoc(doc);
    if (broadcastChange) await broadcastChange(col, 'created', dto, doc.owner);
    return dto;
  };

  const update = async (col, user, id, rawBody) => {
    assertCollection(col);
    const filter = { _id: id, ...(await writeFilter(col, user)) };
    const body = sanitizeBody(rawBody);
    if (user?.role !== 'admin') delete body.owner; // 僅 admin 可透過 PATCH 改 owner
    const schema = schemas[col]?.update;
    if (schema) {
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        const e = new Error(toValidationError(parsed.error));
        e.status = 400;
        throw e;
      }
      // PATCH 只寫入 user 實際送出的 key——若直接 Object.assign(body, parsed.data) 會把
      // schema 內 .default([]) / .default('') 等預設值塞進 body，導致 $set 把使用者
      // 未送的欄位（assignee / tags / attachments / checklist / group...）一併重置。
      // 例：加 checklist 項目只送 { checklist, progress } 時 assignee 會被清空。
      const sentKeys = Object.keys(body);
      for (const k of sentKeys) {
        if (parsed.data[k] !== undefined) body[k] = parsed.data[k];
        else delete body[k]; // input 給了 zod 無法接受的 key（會被 strip）→ 不寫進 DB
      }
    }
    const result = await models[col].findOneAndUpdate(filter, { $set: body }, { new: true });
    if (!result) {
      const e = new Error('資源不存在或無權限');
      e.status = 404;
      throw e;
    }
    logAudit('crud.update', user?.userId, { col, docId: id });
    const dto = toDoc(result);
    if (broadcastChange) await broadcastChange(col, 'updated', dto, result.owner);
    return { ok: true };
  };

  const remove = async (col, user, id) => {
    assertCollection(col);
    const filter = { _id: id, ...(await writeFilter(col, user)) };
    const result = await models[col].findOneAndDelete(filter);
    if (!result) {
      const e = new Error('資源不存在或無權限');
      e.status = 404;
      throw e;
    }
    logAudit('crud.delete', user?.userId, { col, docId: id });
    if (broadcastChange) {
      await broadcastChange(col, 'deleted', { id }, result.owner);
    }
    return { ok: true };
  };

  // 對外暴露 broadcast，供 domain endpoints（如 task recur）在自行操作 model 後同步觸發
  const broadcast = async (col, op, doc, ownerId) => {
    if (broadcastChange) await broadcastChange(col, op, doc, ownerId);
  };

  return { list, create, update, remove, broadcast, readFilter, writeFilter, taskReadQuery, taskWriteQuery, isOwned };
};

module.exports = { buildCrudService, OWNED_COLLECTIONS, readFilter, writeFilter, taskReadQuery, taskWriteQuery, isOwned };
