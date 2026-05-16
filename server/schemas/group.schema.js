const { z } = require('zod');
const { colorString } = require('./common');

const groupCore = {
  name: z.string().min(1).max(100),
  color: colorString,
};

const groupCreateSchema = z.object(groupCore);
const groupUpdateSchema = z.object(groupCore).partial();

module.exports = { groupCreateSchema, groupUpdateSchema };
