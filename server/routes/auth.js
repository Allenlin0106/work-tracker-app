const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const { User } = require('../db');
const { authLimiter } = require('../middleware/rateLimit');
const { validatePassword, PASSWORD_RULE_MSG } = require('../lib/security');
const { logAudit } = require('../lib/audit');

const router = express.Router();

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
    // 第一位使用者自動成為 admin
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
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      logAudit('auth.login.fail', user._id.toString(), { ip: req.ip, username, reason: 'bad_pw' });
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }
    const token = jwt.sign({ userId: user._id.toString(), username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    logAudit('auth.login.success', user._id.toString(), { ip: req.ip, username });
    res.json({ token, username, role: user.role });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
