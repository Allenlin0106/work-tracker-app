const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { recurTask } = require('../services/taskService');

// tasks 路由：泛型 CRUD 由 buildCrudRoutes 提供；本檔加上 task 專屬 endpoint
// 由 index.js 注入 crudService（共用 sanitize / 驗證 / 廣播 / audit）
const buildRouter = (crudService) => {
  const router = express.Router();

  router.get('/', requireAuth, async (req, res, next) => {
    try { res.json(await crudService.list('tasks', req.user)); }
    catch (err) { next(err); }
  });

  router.post('/', requireAuth, async (req, res, next) => {
    try { res.json(await crudService.create('tasks', req.user, req.body)); }
    catch (err) { next(err); }
  });

  router.patch('/:id', requireAuth, async (req, res, next) => {
    try { res.json(await crudService.update('tasks', req.user, req.params.id, req.body)); }
    catch (err) { next(err); }
  });

  router.delete('/:id', requireAuth, async (req, res, next) => {
    try { res.json(await crudService.remove('tasks', req.user, req.params.id)); }
    catch (err) { next(err); }
  });

  // BE-5：循環任務 domain endpoint。標記目前任務完成 + 建立下一週期 task。
  router.post('/:id/recur', requireAuth, async (req, res, next) => {
    try {
      const result = await recurTask(req.user, req.params.id);
      // 廣播：completed 是更新，next 是新增
      await crudService.broadcast('tasks', 'updated', result.completed, result.completed.owner);
      await crudService.broadcast('tasks', 'created', result.next, result.next.owner);
      res.json(result);
    } catch (err) { next(err); }
  });

  return router;
};

module.exports = buildRouter;
