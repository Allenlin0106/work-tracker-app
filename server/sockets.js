const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { JWT_SECRET, CORS_ORIGIN } = require('./config');
const { models, COLLECTIONS, stripDoc } = require('./db');
const { logAudit } = require('./lib/audit');
const { readFilter, OWNED_COLLECTIONS } = require('./services/crudService');

let io = null;

const init = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] }
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('unauthorized'));
    try {
      // 放在 socket.data 上，io.fetchSockets() 取回的 RemoteSocket 才能存取
      socket.data.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.data.user;
    logAudit('ws.connect', user?.userId, { socketId: socket.id, username: user?.username });
    if (user?.userId) socket.join(`u:${user.userId}`);
    if (user?.role === 'admin') socket.join('admins');

    // 初次連線送一次全集合 snapshot
    for (const col of COLLECTIONS) {
      const docs = await models[col].find(await readFilter(col, user)).lean();
      socket.emit(`${col}:updated`, docs.map(stripDoc));
    }
    socket.on('disconnect', () => logAudit('ws.disconnect', user?.userId, { socketId: socket.id }));
  });

  return io;
};

// 增量事件 emit：目前 client 端只訂閱 ${col}:updated 全集 fallback，
// 沒有訂閱 ${col}:created/updated/deleted；此區塊為 dead code，保留但不修正路由。
const broadcastChange = async (col, op, doc, ownerId) => {
  if (!io) return;
  const eventName = `${col}:${op}`;
  if (!OWNED_COLLECTIONS.has(col)) {
    io.emit(eventName, doc);
  } else {
    io.to('admins').emit(eventName, doc);
    if (ownerId) {
      io.to(`u:${ownerId.toString()}`).except('admins').emit(eventName, doc);
    }
  }
  await broadcastCollection(col, ownerId);
};

// 全集合 fallback：依每個連線 socket 的權限重算可見集合再 emit。
// 對大量同時連線會 O(N * Q)，現階段使用者規模可接受；若日後變慢可改為「事件即時 routing」。
const broadcastCollection = async (col /* , ownerId — 不再使用 */) => {
  if (!io) return;
  if (!OWNED_COLLECTIONS.has(col)) {
    const docs = await models[col].find({}).lean();
    io.emit(`${col}:updated`, docs.map(stripDoc));
    return;
  }
  const sockets = await io.fetchSockets();
  for (const s of sockets) {
    const user = s.data?.user;
    if (!user) continue;
    const docs = await models[col].find(await readFilter(col, user)).lean();
    s.emit(`${col}:updated`, docs.map(stripDoc));
  }
};

module.exports = { init, broadcastChange, broadcastCollection };
