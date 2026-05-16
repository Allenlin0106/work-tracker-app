const { z } = require('zod');
const { isoDateString } = require('./common');

const logCore = {
  taskId: z.string().min(1).max(64),
  text: z.string().min(1).max(5000),
  userName: z.string().max(200).default(''),
  timestamp: isoDateString.optional(),
};

const logCreateSchema = z.object(logCore);
const logUpdateSchema = z.object(logCore).partial();

module.exports = { logCreateSchema, logUpdateSchema };
