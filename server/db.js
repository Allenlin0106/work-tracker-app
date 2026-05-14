const mongoose = require('mongoose');
const { MONGO_URI } = require('./config');

const connect = () =>
  mongoose.connect(MONGO_URI)
    .then(() => console.log('[DB] MongoDB connected'))
    .catch(err => {
      console.error('[DB] Connection error:', err.message);
      process.exit(1);
    });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
}, { timestamps: true });
const User = mongoose.model('User', userSchema, 'users');

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

const stripDoc = (d) => {
  const obj = { ...d, id: d._id.toString() };
  delete obj._id;
  delete obj.__v;
  return obj;
};

module.exports = { connect, User, models, COLLECTIONS, toDoc, stripDoc };
