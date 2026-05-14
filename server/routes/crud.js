const express = require('express');
const { models, COLLECTIONS, toDoc, stripDoc } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sanitizeBody } = require('../lib/sanitize');
const { logAudit } = require('../lib/audit');

// 須做 ownership 過濾的 collections（個人資料）
// groups / tags 為共享的設定資料，不過濾
const OWNED_COLLECTIONS = new Set(['tasks', 'logs']);

const ownerFilter = (col, user) => {
  if (!OWNED_COLLECTIONS.has(col)) return {};
  if (user?.role === 'admin') return {};
  return { owner: user.userId };
};

// 注入 broadcastCollection（由 sockets.js 提供，避免循環引入）
const buildRouter = (broadcastCollection) => {
  const router = express.Router();

  COLLECTIONS.forEach(col => {
    router.get(`/${col}`, requireAuth, async (req, res, next) => {
      try {
        const filter = ownerFilter(col, req.user);
        const docs = await models[col].find(filter).lean();
        res.json(docs.map(stripDoc));
      } catch (err) {
        next(err);
      }
    });

    router.post(`/${col}`, requireAuth, async (req, res, next) => {
      try {
        const body = sanitizeBody(req.body);
        // 自動寫入 owner（owned collections）
        if (OWNED_COLLECTIONS.has(col)) {
          body.owner = req.user.userId;
        }
        const doc = await models[col].create(body);
        logAudit('crud.create', req.user?.userId, { col, docId: doc._id.toString() });
        await broadcastCollection(col, doc.owner);
        res.json(toDoc(doc));
      } catch (err) {
        next(err);
      }
    });

    router.patch(`/${col}/:id`, requireAuth, async (req, res, next) => {
      try {
        const filter = { _id: req.params.id, ...ownerFilter(col, req.user) };
        const body = sanitizeBody(req.body);
        // 不允許透過 PATCH 改 owner
        delete body.owner;
        const result = await models[col].findOneAndUpdate(filter, { $set: body });
        if (!result) return res.status(404).json({ error: '資源不存在或無權限' });
        logAudit('crud.update', req.user?.userId, { col, docId: req.params.id });
        await broadcastCollection(col, result.owner);
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    });

    router.delete(`/${col}/:id`, requireAuth, async (req, res, next) => {
      try {
        const filter = { _id: req.params.id, ...ownerFilter(col, req.user) };
        const result = await models[col].findOneAndDelete(filter);
        if (!result) return res.status(404).json({ error: '資源不存在或無權限' });
        logAudit('crud.delete', req.user?.userId, { col, docId: req.params.id });
        await broadcastCollection(col, result.owner);
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    });
  });

  return router;
};

module.exports = buildRouter;
