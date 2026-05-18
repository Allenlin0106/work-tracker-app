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

// 推送變更：client 端只訂閱 ${col}:updated 全集，沒有訂閱 ${col}:created/deleted。
// 重要：op='updated' 的情形下，eventName 與全集 fallback 同名，直接 emit 單物件會
// 讓前端 setTasks(單物件)，造成 tasks 從陣列變 object，下次 render tasks.map 炸出白屏。
// 因此這裡只走 broadcastCollection（推可見 task 全集），不再 emit ${col}:${op} 單物件。
const broadcastChange = async (col, op, doc, ownerId) => {
  if (!io) return;
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
