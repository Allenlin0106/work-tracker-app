const { z } = require('zod');
const { colorValue } = require('./common');

const tagCore = {
  name: z.string().min(1).max(100),
  color: colorValue,
};

const tagCreateSchema = z.object(tagCore);
const tagUpdateSchema = z.object(tagCore).partial();

module.exports = { tagCreateSchema, tagUpdateSchema };
