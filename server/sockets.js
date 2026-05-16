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
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    logAudit('ws.connect', socket.user?.userId, { socketId: socket.id, username: socket.user?.username });
    if (socket.user?.userId) socket.join(`u:${socket.user.userId}`);
    if (socket.user?.role === 'admin') socket.join('admins');

    // 初次連線送一次全集合 snapshot；之後僅靠增量事件維護
    for (const col of COLLECTIONS) {
      const docs = await models[col].find(ownerFilter(col, socket.user)).lean();
      socket.emit(`${col}:updated`, docs.map(stripDoc));
    }
    socket.on('disconnect', () => logAudit('ws.disconnect', socket.user?.userId, { socketId: socket.id }));
  });

  return io;
};

// BE-6：增量事件廣播。
// op: 'created' | 'updated' | 'deleted'
// doc: created/updated 時為完整 dto；deleted 時為 { id }
// 仍同時觸發舊 ${col}:updated 全集事件當 fallback，給尚未升級的 client 用
const broadcastChange = async (col, op, doc, ownerId) => {
  if (!io) return;
  const eventName = `${col}:${op}`; // tasks:created / tasks:updated / tasks:deleted

  if (!OWNED_COLLECTIONS.has(col)) {
    io.emit(eventName, doc);
  } else {
    io.to('admins').emit(eventName, doc);
    if (ownerId) {
      io.to(`u:${ownerId.toString()}`).except('admins').emit(eventName, doc);
    }
  }

  // Fallback：保留 ${col}:updated 全集合事件，前端尚未切換到增量時不破功
  await broadcastCollection(col, ownerId);
};

// 舊版全集合廣播：向後相容，不馬上移除
const broadcastCollection = async (col, ownerId) => {
  if (!io) return;
  if (!OWNED_COLLECTIONS.has(col)) {
    const docs = await models[col].find({}).lean();
    io.emit(`${col}:updated`, docs.map(stripDoc));
    return;
  }
  const allDocs = await models[col].find({}).lean();
  io.to('admins').emit(`${col}:updated`, allDocs.map(stripDoc));
  if (ownerId) {
    const ownDocs = allDocs.filter(d => d.owner && d.owner.toString() === ownerId.toString());
    io.to(`u:${ownerId.toString()}`).except('admins').emit(`${col}:updated`, ownDocs.map(stripDoc));
  }
};

module.exports = { init, broadcastChange, broadcastCollection };
