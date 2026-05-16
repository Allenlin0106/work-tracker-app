const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const { User } = require('../db');
const { authLimiter } = require('../middleware/rateLimit');
const { validatePassword, PASSWORD_RULE_MSG } = require('../lib/security');
const { logAudit } = require('../lib/audit');

const router = express.Router();

// 失敗鎖定參數（BE-10）：超過 MAX_FAILED 次失敗後鎖 LOCK_MS 毫秒
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;

router.get('/auth/status', async (req, res, next) => {
  try {
    const count = await User.countDocuments();
    res.json({ needsSetup: count === 0 });
  } catch (err) {
    next(err);
  }
});

router.post('/auth/setup', authLimiter, async (req, res, next) => {
  try {
    const count = await User.countDocuments();
    if (count > 0) return res.status(403).json({ error: '設定已完成，請直接登入' });
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '帳號與密碼為必填' });
    if (!validatePassword(password)) return res.status(400).json({ error: PASSWORD_RULE_MSG });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, passwordHash, role: 'admin' });
    const token = jwt.sign({ userId: user._id.toString(), username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    logAudit('auth.setup.success', user._id.toString(), { ip: req.ip, username });
    res.json({ token, username, role: user.role });
  } catch (err) {
    next(err);
  }
});

router.post('/auth/login', authLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '帳號與密碼為必填' });
    const user = await User.findOne({ username });
    if (!user) {
      logAudit('auth.login.fail', null, { ip: req.ip, username, reason: 'no_user' });
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }
    if (user.disabled) {
      logAudit('auth.login.fail', user._id.toString(), { ip: req.ip, username, reason: 'disabled' });
      return res.status(401).json({ error: '帳號已停用' });
    }
    // BE-10：檢查鎖定狀態。lockedUntil 是 Date；超過則自動視為解鎖
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const retryAfterSec = Math.ceil((user.lockedUntil - new Date()) / 1000);
      logAudit('auth.login.fail', user._id.toString(), { ip: req.ip, username, reason: 'locked', retryAfterSec });
      res.set('Retry-After', String(retryAfterSec));
      return res.status(423).json({ error: `帳號已鎖定，請於 ${Math.ceil(retryAfterSec / 60)} 分鐘後再試` });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      // 累計失敗；達到上限即上鎖
      user.failedLoginCount = (user.failedLoginCount || 0) + 1;
      let lockedNow = false;
      if (user.failedLoginCount >= MAX_FAILED) {
        user.lockedUntil = new Date(Date.now() + LOCK_MS);
        user.failedLoginCount = 0;
        lockedNow = true;
      }
      await user.save();
      logAudit('auth.login.fail', user._id.toString(), { ip: req.ip, username, reason: 'bad_pw', lockedNow });
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }
    // 成功 → 歸零計數與鎖定
    if (user.failedLoginCount || user.lockedUntil) {
      user.failedLoginCount = 0;
      user.lockedUntil = null;
      await user.save();
    }
    const token = jwt.sign({ userId: user._id.toString(), username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    logAudit('auth.login.success', user._id.toString(), { ip: req.ip, username });
    res.json({ token, username, role: user.role });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
