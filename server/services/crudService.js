const { models, COLLECTIONS, toDoc, stripDoc } = require('../db');
const { sanitizeBody } = require('../lib/sanitize');
const { logAudit } = require('../lib/audit');
const { schemas } = require('../schemas');

// 須做 ownership 過濾的 collections（個人資料）
// groups / tags 為共享的設定資料，不過濾
const OWNED_COLLECTIONS = new Set(['tasks', 'logs']);

// 權限矩陣：
//   admin → 看全部、寫全部
//   PM    → 看全部、僅寫自己 owner 的
//   user  → 僅看自己 owner 的、僅寫自己 owner 的
const canViewAll = (user) => user?.role === 'admin' || user?.role === 'PM';

// readFilter：list / snapshot / report 等「讀取」場景用
const readFilter = (col, user) => {
  if (!OWNED_COLLECTIONS.has(col)) return {};
  if (canViewAll(user)) return {};
  return { owner: user.userId };
};

// ownerFilter：update / delete 等「寫入」場景用；PM 與 user 同樣只能寫自己 owner 的
const ownerFilter = (col, user) => {
  if (!OWNED_COLLECTIONS.has(col)) return {};
  if (user?.role === 'admin') return {};
  return { owner: user.userId };
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
    const docs = await models[col].find(readFilter(col, user)).lean();
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
    const filter = { _id: id, ...ownerFilter(col, user) };
    const body = sanitizeBody(rawBody);
    delete body.owner; // 不允許透過 PATCH 改 owner
    const schema = schemas[col]?.update;
    if (schema) {
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        const e = new Error(toValidationError(parsed.error));
        e.status = 400;
        throw e;
      }
      Object.assign(body, parsed.data);
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
    const filter = { _id: id, ...ownerFilter(col, user) };
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

  return { list, create, update, remove, broadcast, ownerFilter, readFilter, canViewAll, isOwned };
};

module.exports = { buildCrudService, OWNED_COLLECTIONS, ownerFilter, readFilter, canViewAll, isOwned };
