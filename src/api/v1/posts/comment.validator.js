// src/api/v1/posts/comment.validator.js
import { z } from 'zod';

// :id path param (post id)
export const postIdParamSchema = z.object({
  id: z.coerce.number().int().positive('id must be a positive integer'),
});

// POST /posts/:id/comments
export const createCommentSchema = z.object({
  content: z.string().trim().min(1, 'Nội dung không được để trống').max(2000, 'Tối đa 2000 ký tự'),
});

export default { postIdParamSchema, createCommentSchema };
