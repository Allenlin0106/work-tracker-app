const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { buildReport } = require('../services/reportService');

// 報表 domain endpoint（BE-4）：將前端 reportData useMemo 重邏輯移至後端
// 介面：GET /api/reports?start=ISO&end=ISO&hideTagged=bool
// 回傳形狀與前端原 reportData 一致：[{ task, taskLogs, taskChecklistActivity }]
const router = express.Router();

router.get('/reports', requireAuth, async (req, res, next) => {
  try {
    const result = await buildReport(req.user, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
