const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { CORS_ORIGIN, PORT } = require('./config');
const db = require('./db');
const { apiLimiter } = require('./middleware/rateLimit');
const { logAudit } = require('./lib/audit');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const reportsRoutes = require('./routes/reports');
const buildTasksRouter = require('./routes/tasks');
const buildLogsRouter = require('./routes/logs');
const buildTagsRouter = require('./routes/tags');
const buildGroupsRouter = require('./routes/groups');
const sockets = require('./sockets');
const { buildCrudService } = require('./services/crudService');

const app = express();
const server = http.createServer(app);

// 後方為 Nginx 反向代理，啟用 trust proxy 以正確取得來源 IP
app.set('trust proxy', 1);

// helmet 提供常見 HTTP security headers；CSP 由 Nginx 統一管理
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '50mb' }));
app.use(morgan('combined'));

app.use('/api', apiLimiter);

db.connect().then(() => db.ensureFirstAdmin()).catch(() => {});

sockets.init(server);

// 建立共用 CRUD service，注入增量廣播；route 端透過此 service 操作 model
const crudService = buildCrudService(sockets.broadcastChange);

app.use('/api', authRoutes);
app.use('/api', usersRoutes);
app.use('/api', reportsRoutes);
app.use('/api/tasks', buildTasksRouter(crudService));
app.use('/api/logs', buildLogsRouter(crudService));
app.use('/api/tags', buildTagsRouter(crudService));
app.use('/api/groups', buildGroupsRouter(crudService));

// 全域錯誤處理：統一回應，不洩漏 stack / 內部訊息；
// 業務層（service）丟出帶 status 的 Error 時轉發其 status + 訊息（屬可預期使用者錯誤）
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) {
    logAudit('error', req.user?.userId, { path: req.path, method: req.method, msg: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
  res.status(status).json({ error: err.message || 'Bad request' });
});

server.listen(PORT, () => console.log(`[Server] Running on :${PORT}`));
