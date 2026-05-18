const { z } = require('zod');
const { isoDateString } = require('./common');

// attachment / checklist 內部欄位歷史上不固定，用 passthrough 容錯（不丟未知 key）
const attachmentSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().max(500).optional(),
  url: z.string().max(10_000_000).optional(),
  type: z.string().max(200).optional(),
}).passthrough();

const checklistItemSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  text: z.string().max(2000).optional(),
  done: z.boolean().optional(),
}).passthrough();

// 建立 / 更新 task 共用核心欄位；POST 全必填，PATCH 全 optional（partial）
const taskCore = {
  title: z.string().min(1).max(500),
  // 負責人員：可查看（任何登入者皆可看）+ 編輯任務（assignee.includes(self) 才能寫）
  assignee: z.array(z.string().max(200)).default([]),
  // owner：建立者；DB 仍存，但不再參與權限判定。僅 admin 可透過 PATCH 變更（schema 允許但後端會 gate）
  owner: z.string().max(64).optional(),
  group: z.string().max(200).default(''),
  tags: z.array(z.string().max(200)).default([]),
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
  progress: z.number().min(0).max(100).default(0),
  isRecurring: z.boolean().default(false),
  recurrenceType: z.string().max(64).default(''),
  recurrenceInterval: z.number().int().min(0).max(3650).default(0),
  attachments: z.array(attachmentSchema).default([]),
  checklist: z.array(checklistItemSchema).default([]),
};

const taskCreateSchema = z.object(taskCore);
const taskUpdateSchema = z.object(taskCore).partial();

module.exports = { taskCreateSchema, taskUpdateSchema };
