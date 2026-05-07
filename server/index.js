const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/worktracker';

mongoose.connect(MONGO_URI)
  .then(() => console.log('[DB] MongoDB connected'))
  .catch(err => console.error('[DB] Connection error:', err));

// 使用彈性 schema 讓所有欄位都可儲存
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

// CRUD 路由 - 四個 collection 共用
COLLECTIONS.forEach(col => {
  app.get(`/api/${col}`, async (req, res) => {
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

  app.post(`/api/${col}`, async (req, res) => {
    try {
      const doc = await models[col].create(req.body);
      await broadcastCollection(col);
      res.json(toDoc(doc));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch(`/api/${col}/:id`, async (req, res) => {
    try {
      await models[col].findByIdAndUpdate(req.params.id, { $set: req.body });
      await broadcastCollection(col);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete(`/api/${col}/:id`, async (req, res) => {
    try {
      await models[col].findByIdAndDelete(req.params.id);
      await broadcastCollection(col);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
});

// Socket.io：連線時推送全部初始資料
io.on('connection', async (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);
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
