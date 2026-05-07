const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);

const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:8088';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

const io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] }
});

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '50mb' }));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/worktracker';

mongoose.connect(MONGO_URI)
  .then(() => console.log('[DB] MongoDB connected'))
  .catch(err => console.error('[DB] Connection error:', err));

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

// 清理請求 body：拒絕以 $ 開頭的 key（防 NoSQL Injection），限制字串長度
const sanitizeBody = (obj, maxLen = 5000) => {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return obj;
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('$')) continue;
    if (typeof v === 'string') {
      clean[k] = v.length > maxLen ? v.slice(0, maxLen) : v;
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

// --- 公開路由（不需 JWT）---

// 查詢是否需要首次設定
app.get('/api/auth/status', async (req, res) => {
  try {
    const count = await User.countDocuments();
    res.json({ needsSetup: count === 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 首次設定：僅在 users 為空時可建立第一位管理員
app.post('/api/auth/setup', async (req, res) => {
  try {
    const count = await User.countDocuments();
    if (count > 0) return res.status(403).json({ error: '設定已完成，請直接登入' });
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '帳號與密碼為必填' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, passwordHash });
    const token = jwt.sign({ userId: user._id.toString(), username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 登入
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '帳號與密碼為必填' });
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: '帳號或密碼錯誤' });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: '帳號或密碼錯誤' });
    const token = jwt.sign({ userId: user._id.toString(), username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
  app.get(`/api/${col}`, requireAuth, async (req, res) => {
    try {
      const docs = await models[col].find({}).lean();
      res.json(docs.map(d => {
        const obj = { ...d, id: d._id.toString() };
        delete obj._id;
        delete obj.__v;
        return obj;
      }));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(`/api/${col}`, requireAuth, async (req, res) => {
    try {
      const doc = await models[col].create(sanitizeBody(req.body));
      await broadcastCollection(col);
      res.json(toDoc(doc));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch(`/api/${col}/:id`, requireAuth, async (req, res) => {
    try {
      await models[col].findByIdAndUpdate(req.params.id, { $set: sanitizeBody(req.body) });
      await broadcastCollection(col);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete(`/api/${col}/:id`, requireAuth, async (req, res) => {
    try {
      await models[col].findByIdAndDelete(req.params.id);
      await broadcastCollection(col);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
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
  console.log(`[WS] Client connected: ${socket.id} (${socket.user.username})`);
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
  socket.on('disconnect', () => console.log(`[WS] Client disconnected: ${socket.id}`));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`[Server] Running on :${PORT}`));
