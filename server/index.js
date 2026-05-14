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
const buildCrudRouter = require('./routes/crud');
const sockets = require('./sockets');

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

db.connect();

sockets.init(server);

app.use('/api', authRoutes);
app.use('/api', buildCrudRouter(sockets.broadcastCollection));

// 全域錯誤處理：統一回應，不洩漏 stack / 內部訊息
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logAudit('error', req.user?.userId, { path: req.path, method: req.method, msg: err.message });
  res.status(err.status || 500).json({ error: 'Internal error' });
});

server.listen(PORT, () => console.log(`[Server] Running on :${PORT}`));
