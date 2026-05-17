const mongoose = require('mongoose');
const { MONGO_URI } = require('./config');

const connect = () =>
  mongoose.connect(MONGO_URI)
    .then(() => console.log('[DB] MongoDB connected'))
    .catch(err => {
      console.error('[DB] Connection error:', err.message);
      process.exit(1);
    });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'PM', 'user'], default: 'user' },
  disabled: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  // 登入失敗計數鎖定（BE-10）：超過閾值即鎖到 lockedUntil；成功登入後歸零
  failedLoginCount: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
}, { timestamps: true });
const User = mongoose.model('User', userSchema, 'users');

// 啟動後遷移：若無任何 admin，把最早建立的使用者升為 admin（保留既有單帳號 setup 流程）
const ensureFirstAdmin = async () => {
  const adminCount = await User.countDocuments({ role: 'admin' });
  if (adminCount > 0) return;
  const oldest = await User.findOne({}).sort({ createdAt: 1 });
  if (!oldest) return;
  oldest.role = 'admin';
  await oldest.save();
  console.log(`[DB] Promoted user "${oldest.username}" to admin (no admin existed)`);
};

// 業務 collection schema：保留 strict:false 以容忍歷史欄位（attachments / checklist 結構演化）
// 業務層由 server/schemas/*.js 的 Zod 驗證把關（BE-3），DB 層不再雙重限制
const flexSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
const COLLECTIONS = ['tasks', 'logs', 'groups', 'tags'];
const models = {};
COLLECTIONS.forEach(col => {
  models[col] = mongoose.model(col, flexSchema.clone(), col);
});

const toDoc = (d) => {
  const obj = d.toObject ? d.toObject() : { ...d };
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
};

const stripDoc = (d) => {
  const obj = { ...d, id: d._id.toString() };
  delete obj._id;
  delete obj.__v;
  return obj;
};

module.exports = { connect, ensureFirstAdmin, User, models, COLLECTIONS, toDoc, stripDoc };
