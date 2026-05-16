const { z } = require('zod');
const { colorString } = require('./common');

const tagCore = {
  name: z.string().min(1).max(100),
  color: colorString,
};

const tagCreateSchema = z.object(tagCore);
const tagUpdateSchema = z.object(tagCore).partial();

module.exports = { tagCreateSchema, tagUpdateSchema };
