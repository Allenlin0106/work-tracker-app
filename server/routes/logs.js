const express = require('express');
const { requireAuth } = require('../middleware/auth');

const buildRouter = (crudService) => {
  const router = express.Router();

  router.get('/', requireAuth, async (req, res, next) => {
    try { res.json(await crudService.list('logs', req.user)); }
    catch (err) { next(err); }
  });

  router.post('/', requireAuth, async (req, res, next) => {
    try { res.json(await crudService.create('logs', req.user, req.body)); }
    catch (err) { next(err); }
  });

  router.patch('/:id', requireAuth, async (req, res, next) => {
    try { res.json(await crudService.update('logs', req.user, req.params.id, req.body)); }
    catch (err) { next(err); }
  });

  router.delete('/:id', requireAuth, async (req, res, next) => {
    try { res.json(await crudService.remove('logs', req.user, req.params.id)); }
    catch (err) { next(err); }
  });

  return router;
};

module.exports = buildRouter;
