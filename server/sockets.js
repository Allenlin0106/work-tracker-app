const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { JWT_SECRET, CORS_ORIGIN } = require('./config');
const { models, COLLECTIONS, stripDoc } = require('./db');
const { logAudit } = require('./lib/audit');

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
    for (const col of COLLECTIONS) {
      const docs = await models[col].find({}).lean();
      socket.emit(`${col}:updated`, docs.map(stripDoc));
    }
    socket.on('disconnect', () => logAudit('ws.disconnect', socket.user?.userId, { socketId: socket.id }));
  });

  return io;
};

const broadcastCollection = async (col) => {
  if (!io) return;
  const docs = await models[col].find({}).lean();
  io.emit(`${col}:updated`, docs.map(stripDoc));
};

module.exports = { init, broadcastCollection };
