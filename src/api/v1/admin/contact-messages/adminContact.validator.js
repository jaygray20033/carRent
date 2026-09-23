// src/api/v1/admin/contact-messages/adminContact.validator.js
// Day 36 (UC-29) — admin contact message management.
import { z } from 'zod';

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('id must be a positive integer'),
});

export const listQuerySchema = z.object({
  status: z.enum(['NEW', 'READ', 'REPLIED']).optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

export const updateContactSchema = z
  .object({
    status: z.enum(['READ', 'REPLIED']).optional(),
    replyNote: z.string().trim().max(4000).optional().or(z.literal('')),
  })
  .refine((v) => v.status !== undefined || v.replyNote !== undefined, {
    message: 'Cần ít nhất một trường để cập nhật',
  });

export default { idParamSchema, listQuerySchema, updateContactSchema };
