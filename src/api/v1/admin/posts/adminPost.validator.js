// src/api/v1/admin/posts/adminPost.validator.js
import { z } from 'zod';

const STATUS = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('id must be a positive integer'),
});

// GET /admin/posts?status=&q=&page=&size=
export const listQuerySchema = z.object({
  status: z.enum(STATUS).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

const slugRule = z
  .string()
  .min(2)
  .max(220)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case');

export const createPostSchema = z.object({
  title: z.string().trim().min(3, 'Tiêu đề tối thiểu 3 ký tự').max(200),
  slug: slugRule.optional(), // auto-generated from title when omitted
  excerpt: z.string().trim().max(500).optional(),
  content: z.string().trim().min(1, 'Nội dung không được để trống'),
  thumbnailUrl: z.string().url('Ảnh bìa phải là URL hợp lệ').optional().or(z.literal('')),
  categoryId: z.coerce.number().int().positive().optional(),
  tags: z.array(z.coerce.number().int().positive()).max(20).optional(),
  status: z.enum(STATUS).optional(),
  isFeatured: z.boolean().optional(),
  publishedAt: z.coerce.date().optional(),
});

export const updatePostSchema = createPostSchema.partial();

export default { idParamSchema, listQuerySchema, createPostSchema, updatePostSchema };
