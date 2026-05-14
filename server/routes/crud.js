const express = require('express');
const { models, COLLECTIONS, toDoc, stripDoc } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sanitizeBody } = require('../lib/sanitize');
const { logAudit } = require('../lib/audit');

// 注入 broadcastCollection（由 sockets.js 提供，避免循環引入）
const buildRouter = (broadcastCollection) => {
  const router = express.Router();

  COLLECTIONS.forEach(col => {
    router.get(`/${col}`, requireAuth, async (req, res, next) => {
      try {
        const docs = await models[col].find({}).lean();
        res.json(docs.map(stripDoc));
      } catch (err) {
        next(err);
      }
    });

    router.post(`/${col}`, requireAuth, async (req, res, next) => {
      try {
        const doc = await models[col].create(sanitizeBody(req.body));
        logAudit('crud.create', req.user?.userId, { col, docId: doc._id.toString() });
        await broadcastCollection(col);
        res.json(toDoc(doc));
      } catch (err) {
        next(err);
      }
    });

    router.patch(`/${col}/:id`, requireAuth, async (req, res, next) => {
      try {
        await models[col].findByIdAndUpdate(req.params.id, { $set: sanitizeBody(req.body) });
        logAudit('crud.update', req.user?.userId, { col, docId: req.params.id });
        await broadcastCollection(col);
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    });

    router.delete(`/${col}/:id`, requireAuth, async (req, res, next) => {
      try {
        await models[col].findByIdAndDelete(req.params.id);
        logAudit('crud.delete', req.user?.userId, { col, docId: req.params.id });
        await broadcastCollection(col);
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    });
  });

  return router;
};

module.exports = buildRouter;
