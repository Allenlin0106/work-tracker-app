const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// --- 環境變數驗證（缺失或不符規即拒絕啟動）---
const requireEnv = (name, { minLen = 0 } = {}) => {
  const v = process.env[name];
  if (!v || v.length < minLen) {
    console.error(`[Config] ${name} is required${minLen ? ` (>=${minLen} chars)` : ''}. Refusing to start.`);
    process.exit(1);
  }
  return v;
};

const JWT_SECRET = requireEnv('JWT_SECRET', { minLen: 32 });
const CORS_ORIGIN = requireEnv('CORS_ORIGIN');
const MONGO_URI = requireEnv('MONGO_URI');

const app = express();
const server = http.createServer(app);

// 後方為 Nginx 反向代理，啟用 trust proxy 以正確取得來源 IP
app.set('trust proxy', 1);

const io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] }
});

// --- 安全與 logging 中介層 ---
// helmet 提供常見 HTTP security headers；CSP 由 Nginx 統一管理
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '50mb' }));
app.use(morgan('combined'));

// --- 稽核日誌：以 stdout 輸出一行 JSON（由 docker logs 收集）---
const logAudit = (event, userId, meta = {}) => {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    event,
    userId: userId || null,
    ...meta,
  }));
};

// --- 速率限制 ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please retry later' },
});

const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded' },
});

app.use('/api', apiLimiter);

mongoose.connect(MONGO_URI)
  .then(() => console.log('[DB] MongoDB connected'))
  .catch(err => {
    console.error('[DB] Connection error:', err.message);
    process.exit(1);
  });

// 使用者帳號（用於身分驗證）
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
}, { timestamps: true });
const User = mongoose.model('User', userSchema, 'users');

// 資料 collections（彈性 schema）
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

const broadcastCollection = async (col) => {
  const docs = await models[col].find({}).lean();
  const mapped = docs.map(d => {
    const obj = { ...d, id: d._id.toString() };
    delete obj._id;
    delete obj.__v;
    return obj;
  });
  io.emit(`${col}:updated`, mapped);
};

// URL 協定白名單：附件 / 連結欄位僅允許下列協定，阻擋 javascript:/file:/vbscript: 等
const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const URL_FIELD_KEYS = new Set(['url', 'link', 'href']);
const isSafeUrl = (str) => {
  if (typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (!trimmed) return false;
  // 允許前端 compressImage 產出的 data:image/... 影像
  if (trimmed.startsWith('data:image/')) return true;
  try {
    const u = new URL(trimmed);
    return SAFE_URL_PROTOCOLS.has(u.protocol);
  } catch {
    return false;
  }
};

// 清理請求 body：拒絕 $ 開頭 key、限制字串長度、url 類欄位走協定白名單
const sanitizeBody = (obj, maxLen = 5000) => {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return obj;
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('$')) continue;
    if (typeof v === 'string') {
      const trimmedVal = v.length > maxLen ? v.slice(0, maxLen) : v;
      if (URL_FIELD_KEYS.has(k) && !isSafeUrl(trimmedVal)) {
        clean[k] = '';
      } else {
        clean[k] = trimmedVal;
      }
    } else if (Array.isArray(v)) {
      clean[k] = v.map(item => (typeof item === 'object' ? sanitizeBody(item, maxLen) : item));
    } else if (typeof v === 'object' && v !== null) {
      clean[k] = sanitizeBody(v, maxLen);
    } else {
      clean[k] = v;
    }
  }
  return clean;
};

// 密碼強度規則：>=12 字、需含大寫/小寫/數字
const PASSWORD_RULE_MSG = '密碼至少 12 字元，需包含大寫、小寫、數字';
const validatePassword = (pw) =>
  typeof pw === 'string' && pw.length >= 12 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);

// --- 公開路由（不需 JWT）---

app.get('/api/auth/status', async (req, res, next) => {
  try {
    const count = await User.countDocuments();
    res.json({ needsSetup: count === 0 });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/setup', authLimiter, async (req, res, next) => {
  try {
    const count = await User.countDocuments();
    if (count > 0) return res.status(403).json({ error: '設定已完成，請直接登入' });
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '帳號與密碼為必填' });
    if (!validatePassword(password)) return res.status(400).json({ error: PASSWORD_RULE_MSG });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, passwordHash });
    const token = jwt.sign({ userId: user._id.toString(), username }, JWT_SECRET, { expiresIn: '30d' });
    logAudit('auth.setup.success', user._id.toString(), { ip: req.ip, username });
    res.json({ token, username });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '帳號與密碼為必填' });
    const user = await User.findOne({ username });
    if (!user) {
      logAudit('auth.login.fail', null, { ip: req.ip, username, reason: 'no_user' });
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      logAudit('auth.login.fail', user._id.toString(), { ip: req.ip, username, reason: 'bad_pw' });
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }
    const token = jwt.sign({ userId: user._id.toString(), username }, JWT_SECRET, { expiresIn: '30d' });
    logAudit('auth.login.success', user._id.toString(), { ip: req.ip, username });
    res.json({ token, username });
  } catch (err) {
    next(err);
  }
});

// --- JWT 中介層（後續所有路由皆需驗證）---

const requireAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: '無效或過期的 token' });
  }
};

// --- 受保護的 CRUD 路由 ---

COLLECTIONS.forEach(col => {
  app.get(`/api/${col}`, requireAuth, async (req, res, next) => {
    try {
      const docs = await models[col].find({}).lean();
      res.json(docs.map(d => {
        const obj = { ...d, id: d._id.toString() };
        delete obj._id;
        delete obj.__v;
        return obj;
      }));
    } catch (err) {
      next(err);
    }
  });

  app.post(`/api/${col}`, requireAuth, async (req, res, next) => {
    try {
      const doc = await models[col].create(sanitizeBody(req.body));
      logAudit('crud.create', req.user?.userId, { col, docId: doc._id.toString() });
      await broadcastCollection(col);
      res.json(toDoc(doc));
    } catch (err) {
      next(err);
    }
  });

  app.patch(`/api/${col}/:id`, requireAuth, async (req, res, next) => {
    try {
      await models[col].findByIdAndUpdate(req.params.id, { $set: sanitizeBody(req.body) });
      logAudit('crud.update', req.user?.userId, { col, docId: req.params.id });
      await broadcastCollection(col);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.delete(`/api/${col}/:id`, requireAuth, async (req, res, next) => {
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

// --- 全域錯誤處理：統一回應，不洩漏 stack / 內部訊息 ---
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logAudit('error', req.user?.userId, { path: req.path, method: req.method, msg: err.message });
  res.status(err.status || 500).json({ error: 'Internal error' });
});

// --- Socket.io：連線時驗證 JWT ---

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('unauthorized'));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', async (socket) => {
  logAudit('ws.connect', socket.user?.userId, { socketId: socket.id, username: socket.user?.username });
  for (const col of COLLECTIONS) {
    const docs = await models[col].find({}).lean();
    const mapped = docs.map(d => {
      const obj = { ...d, id: d._id.toString() };
      delete obj._id;
      delete obj.__v;
      return obj;
    });
    socket.emit(`${col}:updated`, mapped);
  }
  socket.on('disconnect', () => logAudit('ws.disconnect', socket.user?.userId, { socketId: socket.id }));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`[Server] Running on :${PORT}`));
