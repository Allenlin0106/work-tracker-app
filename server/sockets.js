const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { JWT_SECRET, CORS_ORIGIN } = require('./config');
const { models, COLLECTIONS, stripDoc } = require('./db');
const { logAudit } = require('./lib/audit');

const OWNED_COLLECTIONS = new Set(['tasks', 'logs']);

const ownerFilter = (col, user) => {
  if (!OWNED_COLLECTIONS.has(col)) return {};
  if (user?.role === 'admin') return {};
  return { owner: user.userId };
};

let io = null;

const init = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] }
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('unauthorized'));
    try {
      socket.user = jwt.verify(token, JWT_SECRET);
      // 將 user 寫入 socket 自身房間，便於精準推送
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    logAudit('ws.connect', socket.user?.userId, { socketId: socket.id, username: socket.user?.username });
    // 加入個人房間（依 userId）；admin 額外加入 admin room 以收到全表廣播
    if (socket.user?.userId) socket.join(`u:${socket.user.userId}`);
    if (socket.user?.role === 'admin') socket.join('admins');

    for (const col of COLLECTIONS) {
      const docs = await models[col].find(ownerFilter(col, socket.user)).lean();
      socket.emit(`${col}:updated`, docs.map(stripDoc));
    }
    socket.on('disconnect', () => logAudit('ws.disconnect', socket.user?.userId, { socketId: socket.id }));
  });

  return io;
};

// 廣播：對共享 collections 全廣播；對 owned collections 只送 admin 房 + 該擁有者
const broadcastCollection = async (col, ownerId) => {
  if (!io) return;
  if (!OWNED_COLLECTIONS.has(col)) {
    const docs = await models[col].find({}).lean();
    io.emit(`${col}:updated`, docs.map(stripDoc));
    return;
  }
  // owned：admin 收到全部、owner 收到自己份
  const allDocs = await models[col].find({}).lean();
  io.to('admins').emit(`${col}:updated`, allDocs.map(stripDoc));
  if (ownerId) {
    const ownDocs = allDocs.filter(d => d.owner && d.owner.toString() === ownerId.toString());
    io.to(`u:${ownerId}`).except('admins').emit(`${col}:updated`, ownDocs.map(stripDoc));
  }
};

module.exports = { init, broadcastCollection };
