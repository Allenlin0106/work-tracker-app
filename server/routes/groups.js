const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const buildRouter = (crudService) => {
  const router = express.Router();

  router.get('/', requireAuth, async (req, res, next) => {
    try { res.json(await crudService.list('groups', req.user)); }
    catch (err) { next(err); }
  });

  router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
    try { res.json(await crudService.create('groups', req.user, req.body)); }
    catch (err) { next(err); }
  });

  router.patch('/:id', requireAuth, requireAdmin, async (req, res, next) => {
    try { res.json(await crudService.update('groups', req.user, req.params.id, req.body)); }
    catch (err) { next(err); }
  });

  router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
    try { res.json(await crudService.remove('groups', req.user, req.params.id)); }
    catch (err) { next(err); }
  });

  return router;
};

module.exports = buildRouter;
