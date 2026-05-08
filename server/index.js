const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sql = require('mssql');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// --- 啟動時解密敏感憑證 ---

const readFile = (filePath) => {
  try { return fs.readFileSync(filePath, 'utf8').trim(); } catch { return null; }
};

const decrypt = (base64Cipher, keyHex) => {
  const data = Buffer.from(base64Cipher, 'base64');
  const iv = data.slice(0, 16);
  const encrypted = data.slice(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(keyHex, 'hex'), iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};

// 加密金鑰：優先讀 Docker secret 掛載路徑，fallback 本機 secrets/ 目錄
const ENC_KEY =
  readFile('/run/secrets/encryption_key') ||
  readFile(path.join(__dirname, '..', 'secrets', 'encryption_key.txt'));

if (!ENC_KEY) {
  console.error('[ERROR] 找不到加密金鑰，請確認 secrets/encryption_key.txt 存在');
  process.exit(1);
}

// 解密敏感憑證（有 ENCRYPTED_* 時解密；否則直接用明文 env var，供本機開發 fallback）
const SQL_PASSWORD_PLAIN = process.env.ENCRYPTED_SQL_PASSWORD
  ? decrypt(process.env.ENCRYPTED_SQL_PASSWORD, ENC_KEY)
  : process.env.SQL_PASSWORD;

const JWT_SECRET_PLAIN = process.env.ENCRYPTED_JWT_SECRET
  ? decrypt(process.env.ENCRYPTED_JWT_SECRET, ENC_KEY)
  : (process.env.JWT_SECRET || 'dev-secret-change-in-production');

// --- App 初始化 ---

const app = express();
const server = http.createServer(app);

const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:8088';
const JWT_SECRET = JWT_SECRET_PLAIN;

const io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] }
});

app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '50mb' }));

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '嘗試次數過多，請稍後再試' },
});

// --- SQL Server 連線設定 ---

const dbConfig = {
  server: process.env.SQL_SERVER || 'localhost',
  port: parseInt(process.env.SQL_PORT) || 1433,
  user: process.env.SQL_USER,
  password: SQL_PASSWORD_PLAIN,
  database: process.env.SQL_DATABASE || 'worktracker',
  options: {
    encrypt: process.env.SQL_ENCRYPT === 'true',
    trustServerCertificate: process.env.SQL_TRUST_CERT !== 'false',
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
};

let pool;

// --- 工具函式 ---

const tryParse = (str, fallback) => {
  if (str == null) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
};

// 清理請求 body：拒絕以 $ 開頭的 key（防 NoSQL-style injection），不截斷字串（SQL 以型別長度為準）
const sanitizeBody = (obj) => {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return obj;
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('$')) continue;
    clean[k] = Array.isArray(v)
      ? v.map(i => (typeof i === 'object' && i !== null ? sanitizeBody(i) : i))
      : (typeof v === 'object' && v !== null ? sanitizeBody(v) : v);
  }
  return clean;
};

const toDateStr = (d) => d ? new Date(d).toISOString().split('T')[0] : null;

// --- SQL row → 前端 JSON 轉換 ---

const fromTaskRow = (r) => ({
  id: r.id.toLowerCase(),
  title: r.title,
  group: r.group_name,
  assignee: tryParse(r.assignee, []),
  startDate: toDateStr(r.start_date),
  endDate: toDateStr(r.end_date),
  progress: r.progress,
  isRecurring: !!r.is_recurring,
  recurrenceType: r.recurrence_type,
  recurrenceInterval: r.recurrence_interval,
  tags: tryParse(r.tags, []),
  attachments: tryParse(r.attachments, []),
  checklist: tryParse(r.checklist, []),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const fromLogRow = (r) => ({
  id: r.id.toLowerCase(),
  taskId: r.task_id.toLowerCase(),
  text: r.text,
  userName: r.user_name,
  timestamp: r.timestamp,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const fromGroupRow = (r) => ({
  id: r.id.toLowerCase(),
  name: r.name,
  color: r.color,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const fromTagRow = (r) => ({
  id: r.id.toLowerCase(),
  name: r.name,
  color: r.color,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// 集合名稱 → SQL 資料表名稱（groups 加括號避免潛在保留字衝突）
const TABLE_NAME = { tasks: 'tasks', logs: 'logs', groups: '[groups]', tags: 'tags' };
const FROM_ROW   = { tasks: fromTaskRow, logs: fromLogRow, groups: fromGroupRow, tags: fromTagRow };
const COLLECTIONS = ['tasks', 'logs', 'groups', 'tags'];

// --- 資料庫初始化（建立五張資料表）---

const initDb = async () => {
  pool = await sql.connect(dbConfig);
  console.log('[DB] SQL Server connected');

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name=N'users' AND xtype='U')
    CREATE TABLE users (
      id            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      username      NVARCHAR(255)    NOT NULL UNIQUE,
      password_hash NVARCHAR(255)    NOT NULL,
      created_at    DATETIME2        NOT NULL DEFAULT GETDATE(),
      updated_at    DATETIME2        NOT NULL DEFAULT GETDATE()
    )`);

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name=N'groups' AND xtype='U')
    CREATE TABLE [groups] (
      id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      name       NVARCHAR(255)    NOT NULL UNIQUE,
      color      NVARCHAR(50),
      created_at DATETIME2        NOT NULL DEFAULT GETDATE(),
      updated_at DATETIME2        NOT NULL DEFAULT GETDATE()
    )`);

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name=N'tags' AND xtype='U')
    CREATE TABLE tags (
      id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      name       NVARCHAR(255)    NOT NULL UNIQUE,
      color      NVARCHAR(50),
      created_at DATETIME2        NOT NULL DEFAULT GETDATE(),
      updated_at DATETIME2        NOT NULL DEFAULT GETDATE()
    )`);

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name=N'tasks' AND xtype='U')
    CREATE TABLE tasks (
      id                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      title               NVARCHAR(500)    NOT NULL,
      group_name          NVARCHAR(255),
      assignee            NVARCHAR(MAX),
      start_date          DATE,
      end_date            DATE,
      progress            INT              NOT NULL DEFAULT 0,
      is_recurring        BIT              NOT NULL DEFAULT 0,
      recurrence_type     NVARCHAR(50),
      recurrence_interval INT              NOT NULL DEFAULT 1,
      tags                NVARCHAR(MAX),
      attachments         NVARCHAR(MAX),
      checklist           NVARCHAR(MAX),
      created_at          DATETIME2        NOT NULL DEFAULT GETDATE(),
      updated_at          DATETIME2        NOT NULL DEFAULT GETDATE()
    )`);

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name=N'logs' AND xtype='U')
    CREATE TABLE logs (
      id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      task_id    UNIQUEIDENTIFIER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      text       NVARCHAR(MAX),
      user_name  NVARCHAR(255),
      timestamp  DATETIME2,
      created_at DATETIME2        NOT NULL DEFAULT GETDATE(),
      updated_at DATETIME2        NOT NULL DEFAULT GETDATE()
    )`);

  console.log('[DB] Tables ready');
};

// --- 廣播（讀取整張資料表推送至所有客戶端）---

const broadcastCollection = async (col) => {
  const result = await pool.request().query(`SELECT * FROM ${TABLE_NAME[col]} ORDER BY created_at`);
  io.emit(`${col}:updated`, result.recordset.map(FROM_ROW[col]));
};

// --- Collection-specific INSERT ---

const insertTask = async (body) => {
  const r = await pool.request()
    .input('title',               sql.NVarChar(sql.MAX), body.title || '')
    .input('group_name',          sql.NVarChar(sql.MAX), body.group || null)
    .input('assignee',            sql.NVarChar(sql.MAX), JSON.stringify(Array.isArray(body.assignee) ? body.assignee : body.assignee ? [body.assignee] : []))
    .input('start_date',          sql.Date,              body.startDate || null)
    .input('end_date',            sql.Date,              body.endDate || null)
    .input('progress',            sql.Int,               body.progress ?? 0)
    .input('is_recurring',        sql.Bit,               body.isRecurring ? 1 : 0)
    .input('recurrence_type',     sql.NVarChar(sql.MAX), body.recurrenceType || null)
    .input('recurrence_interval', sql.Int,               body.recurrenceInterval ?? 1)
    .input('tags',                sql.NVarChar(sql.MAX), JSON.stringify(body.tags || []))
    .input('attachments',         sql.NVarChar(sql.MAX), JSON.stringify(body.attachments || []))
    .input('checklist',           sql.NVarChar(sql.MAX), JSON.stringify(body.checklist || []))
    .query(`INSERT INTO tasks
      (title, group_name, assignee, start_date, end_date, progress, is_recurring, recurrence_type, recurrence_interval, tags, attachments, checklist)
      OUTPUT INSERTED.*
      VALUES
      (@title, @group_name, @assignee, @start_date, @end_date, @progress, @is_recurring, @recurrence_type, @recurrence_interval, @tags, @attachments, @checklist)`);
  return fromTaskRow(r.recordset[0]);
};

const insertLog = async (body) => {
  const r = await pool.request()
    .input('task_id',   sql.UniqueIdentifier,  body.taskId)
    .input('text',      sql.NVarChar(sql.MAX),  body.text || '')
    .input('user_name', sql.NVarChar(sql.MAX),  body.userName || '')
    .input('timestamp', sql.DateTime2,          body.timestamp ? new Date(body.timestamp) : new Date())
    .query(`INSERT INTO logs (task_id, text, user_name, timestamp)
      OUTPUT INSERTED.*
      VALUES (@task_id, @text, @user_name, @timestamp)`);
  return fromLogRow(r.recordset[0]);
};

const insertGroup = async (body) => {
  const r = await pool.request()
    .input('name',  sql.NVarChar(sql.MAX), body.name || '')
    .input('color', sql.NVarChar(50),      body.color || null)
    .query(`INSERT INTO [groups] (name, color) OUTPUT INSERTED.* VALUES (@name, @color)`);
  return fromGroupRow(r.recordset[0]);
};

const insertTag = async (body) => {
  const r = await pool.request()
    .input('name',  sql.NVarChar(sql.MAX), body.name || '')
    .input('color', sql.NVarChar(50),      body.color || null)
    .query(`INSERT INTO tags (name, color) OUTPUT INSERTED.* VALUES (@name, @color)`);
  return fromTagRow(r.recordset[0]);
};

const COL_INSERT = { tasks: insertTask, logs: insertLog, groups: insertGroup, tags: insertTag };

// --- 動態 PATCH helper（依欄位對應表建立 SET 子句）---

const buildUpdate = async (table, id, body, fieldMap) => {
  const request = pool.request().input('id', sql.UniqueIdentifier, id);
  const setParts = [];
  for (const { key, col, type, val } of fieldMap) {
    if (key in body) {
      const pname = `p_${col}`;
      request.input(pname, type, val(body[key]));
      setParts.push(`${col} = @${pname}`);
    }
  }
  if (!setParts.length) return;
  setParts.push('updated_at = GETDATE()');
  await request.query(`UPDATE ${table} SET ${setParts.join(', ')} WHERE id = @id`);
};

// 欄位對應表：前端 key → SQL 欄位名稱 / 型別 / 值轉換
const TASK_FIELD_MAP = [
  { key: 'title',              col: 'title',               type: sql.NVarChar(sql.MAX), val: v => v },
  { key: 'group',              col: 'group_name',          type: sql.NVarChar(sql.MAX), val: v => v || null },
  { key: 'assignee',           col: 'assignee',            type: sql.NVarChar(sql.MAX), val: v => JSON.stringify(Array.isArray(v) ? v : v ? [v] : []) },
  { key: 'startDate',          col: 'start_date',          type: sql.Date,              val: v => v || null },
  { key: 'endDate',            col: 'end_date',            type: sql.Date,              val: v => v || null },
  { key: 'progress',           col: 'progress',            type: sql.Int,               val: v => v ?? 0 },
  { key: 'isRecurring',        col: 'is_recurring',        type: sql.Bit,               val: v => v ? 1 : 0 },
  { key: 'recurrenceType',     col: 'recurrence_type',     type: sql.NVarChar(sql.MAX), val: v => v || null },
  { key: 'recurrenceInterval', col: 'recurrence_interval', type: sql.Int,               val: v => v ?? 1 },
  { key: 'tags',               col: 'tags',                type: sql.NVarChar(sql.MAX), val: v => JSON.stringify(v || []) },
  { key: 'attachments',        col: 'attachments',         type: sql.NVarChar(sql.MAX), val: v => JSON.stringify(v || []) },
  { key: 'checklist',          col: 'checklist',           type: sql.NVarChar(sql.MAX), val: v => JSON.stringify(v || []) },
];

const LOG_FIELD_MAP = [
  { key: 'text',      col: 'text',      type: sql.NVarChar(sql.MAX), val: v => v },
  { key: 'userName',  col: 'user_name', type: sql.NVarChar(sql.MAX), val: v => v },
  { key: 'timestamp', col: 'timestamp', type: sql.DateTime2,          val: v => v ? new Date(v) : null },
];

const GROUP_FIELD_MAP = [
  { key: 'name',  col: 'name',  type: sql.NVarChar(sql.MAX), val: v => v },
  { key: 'color', col: 'color', type: sql.NVarChar(50),      val: v => v },
];

const COL_FIELD_MAP = { tasks: TASK_FIELD_MAP, logs: LOG_FIELD_MAP, groups: GROUP_FIELD_MAP, tags: GROUP_FIELD_MAP };

// --- 公開路由（不需 JWT）---

app.get('/api/auth/status', async (req, res) => {
  try {
    const r = await pool.request().query('SELECT COUNT(*) AS cnt FROM users');
    res.json({ needsSetup: r.recordset[0].cnt === 0 });
  } catch (err) { console.error(err); res.status(500).json({ error: '內部伺服器錯誤' }); }
});

app.post('/api/auth/setup', async (req, res) => {
  try {
    const cnt = (await pool.request().query('SELECT COUNT(*) AS cnt FROM users')).recordset[0].cnt;
    if (cnt > 0) return res.status(403).json({ error: '設定已完成，請直接登入' });
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '帳號與密碼為必填' });
    if (password.length < 8 || !/[0-9]/.test(password))
      return res.status(400).json({ error: '密碼需至少 8 個字元且包含數字' });
    const passwordHash = await bcrypt.hash(password, 12);
    const r = await pool.request()
      .input('username',      sql.NVarChar(255), username)
      .input('password_hash', sql.NVarChar(255), passwordHash)
      .query('INSERT INTO users (username, password_hash) OUTPUT INSERTED.id, INSERTED.username VALUES (@username, @password_hash)');
    const user = r.recordset[0];
    const token = jwt.sign({ userId: user.id.toLowerCase(), username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username: user.username });
  } catch (err) { console.error(err); res.status(500).json({ error: '內部伺服器錯誤' }); }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '帳號與密碼為必填' });
    const r = await pool.request()
      .input('username', sql.NVarChar(255), username)
      .query('SELECT * FROM users WHERE username = @username');
    const user = r.recordset[0];
    if (!user) return res.status(401).json({ error: '帳號或密碼錯誤' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: '帳號或密碼錯誤' });
    const token = jwt.sign({ userId: user.id.toLowerCase(), username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username: user.username });
  } catch (err) { console.error(err); res.status(500).json({ error: '內部伺服器錯誤' }); }
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
      const result = await pool.request().query(`SELECT * FROM ${TABLE_NAME[col]} ORDER BY created_at`);
      res.json(result.recordset.map(FROM_ROW[col]));
    } catch (err) { console.error(err); res.status(500).json({ error: '內部伺服器錯誤' }); }
  });

  app.post(`/api/${col}`, requireAuth, async (req, res) => {
    try {
      const doc = await COL_INSERT[col](sanitizeBody(req.body));
      await broadcastCollection(col);
      res.json(doc);
    } catch (err) { console.error(err); res.status(500).json({ error: '內部伺服器錯誤' }); }
  });

  app.patch(`/api/${col}/:id`, requireAuth, async (req, res) => {
    try {
      await buildUpdate(TABLE_NAME[col], req.params.id, sanitizeBody(req.body), COL_FIELD_MAP[col]);
      await broadcastCollection(col);
      res.json({ ok: true });
    } catch (err) { console.error(err); res.status(500).json({ error: '內部伺服器錯誤' }); }
  });

  app.delete(`/api/${col}/:id`, requireAuth, async (req, res) => {
    try {
      await pool.request()
        .input('id', sql.UniqueIdentifier, req.params.id)
        .query(`DELETE FROM ${TABLE_NAME[col]} WHERE id = @id`);
      await broadcastCollection(col);
      res.json({ ok: true });
    } catch (err) { console.error(err); res.status(500).json({ error: '內部伺服器錯誤' }); }
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
    const result = await pool.request().query(`SELECT * FROM ${TABLE_NAME[col]} ORDER BY created_at`);
    socket.emit(`${col}:updated`, result.recordset.map(FROM_ROW[col]));
  }
  socket.on('disconnect', () => console.log(`[WS] Client disconnected: ${socket.id}`));
});

// --- 啟動（等 DB 連線成功再開 HTTP）---

const PORT = process.env.PORT || 3001;

initDb()
  .then(() => server.listen(PORT, () => console.log(`[Server] Running on :${PORT}`)))
  .catch(err => { console.error('[DB] Failed to connect:', err.message); process.exit(1); });
