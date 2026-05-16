// 集中匯出，route 端依 collection 名取得 create/update schema
const { taskCreateSchema, taskUpdateSchema } = require('./task.schema');
const { logCreateSchema, logUpdateSchema } = require('./log.schema');
const { tagCreateSchema, tagUpdateSchema } = require('./tag.schema');
const { groupCreateSchema, groupUpdateSchema } = require('./group.schema');

const schemas = {
  tasks: { create: taskCreateSchema, update: taskUpdateSchema },
  logs: { create: logCreateSchema, update: logUpdateSchema },
  tags: { create: tagCreateSchema, update: tagUpdateSchema },
  groups: { create: groupCreateSchema, update: groupUpdateSchema },
};

module.exports = { schemas };
