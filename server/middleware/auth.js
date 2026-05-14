const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');

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

module.exports = { requireAuth };
