const express = require('express');
const bcrypt = require('bcryptjs');
const { User } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { validatePassword, PASSWORD_RULE_MSG } = require('../lib/security');
const { logAudit } = require('../lib/audit');

const router = express.Router();

const toUserDto = (u) => ({
  id: u._id.toString(),
  username: u.username,
  role: u.role,
  disabled: !!u.disabled,
  createdBy: u.createdBy ? u.createdBy.toString() : null,
  createdAt: u.createdAt,
});

// 任務「負責人員」picker 需要清單，但不該要求 admin 權限。
// 此 endpoint 必須放在 router.use(requireAdmin) 之前。
router.get('/users/options', requireAuth, async (req, res, next) => {
  try {
    const users = await User.find({ disabled: { $ne: true } }, { username: 1 })
      .sort({ username: 1 })
      .lean();
    res.json(users.map(u => ({ id: u._id.toString(), username: u.username })));
  } catch (err) {
    next(err);
  }
});

router.use(requireAuth, requireAdmin);

// 列出所有使用者
router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find({}).sort({ createdAt: 1 }).lean();
    res.json(users.map(u => toUserDto(u)));
  } catch (err) {
    next(err);
  }
});

// 新增使用者（admin 建立）
router.post('/users', async (req, res, next) => {
  try {
    const { username, password, role } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: '帳號與密碼為必填' });
    if (!validatePassword(password)) return res.status(400).json({ error: PASSWORD_RULE_MSG });
    if (role && !['admin', 'PM', 'user'].includes(role)) return res.status(400).json({ error: '角色不合法' });
    const exists = await User.findOne({ username });
    if (exists) return res.status(409).json({ error: '帳號已存在' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      username,
      passwordHash,
      role: role || 'user',
      createdBy: req.user.userId,
    });
    logAudit('user.create', req.user.userId, { targetId: user._id.toString(), username, role: user.role });
    res.json(toUserDto(user));
  } catch (err) {
    next(err);
  }
});

// 變更角色 / 顯示資訊（不含密碼，密碼用 reset-password）
router.patch('/users/:id', async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: '使用者不存在' });
    const { role } = req.body || {};
    if (role && !['admin', 'PM', 'user'].includes(role)) return res.status(400).json({ error: '角色不合法' });
    if (role && target.role !== role) {
      // 防止把最後一位 admin 降為非 admin（PM 也算降級）
      if (target.role === 'admin' && role !== 'admin') {
        const adminCount = await User.countDocuments({ role: 'admin' });
        if (adminCount <= 1) return res.status(400).json({ error: '至少需保留一位 admin' });
      }
      target.role = role;
    }
    await target.save();
    logAudit('user.update', req.user.userId, { targetId: target._id.toString(), role: target.role });
    res.json(toUserDto(target));
  } catch (err) {
    next(err);
  }
});

// 重設密碼
router.post('/users/:id/reset-password', async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!validatePassword(password)) return res.status(400).json({ error: PASSWORD_RULE_MSG });
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: '使用者不存在' });
    target.passwordHash = await bcrypt.hash(password, 12);
    await target.save();
    logAudit('user.reset_password', req.user.userId, { targetId: target._id.toString() });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// 停用 / 啟用
router.post('/users/:id/disable', async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: '使用者不存在' });
    if (target._id.toString() === req.user.userId) return res.status(400).json({ error: '不可停用自己' });
    if (target.role === 'admin') {
      const enabledAdmins = await User.countDocuments({ role: 'admin', disabled: false });
      if (enabledAdmins <= 1) return res.status(400).json({ error: '至少需保留一位啟用的 admin' });
    }
    target.disabled = true;
    await target.save();
    logAudit('user.disable', req.user.userId, { targetId: target._id.toString() });
    res.json(toUserDto(target));
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/enable', async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: '使用者不存在' });
    target.disabled = false;
    await target.save();
    logAudit('user.enable', req.user.userId, { targetId: target._id.toString() });
    res.json(toUserDto(target));
  } catch (err) {
    next(err);
  }
});

// 刪除使用者
router.delete('/users/:id', async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: '使用者不存在' });
    if (target._id.toString() === req.user.userId) return res.status(400).json({ error: '不可刪除自己' });
    if (target.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) return res.status(400).json({ error: '至少需保留一位 admin' });
    }
    await target.deleteOne();
    logAudit('user.delete', req.user.userId, { targetId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
