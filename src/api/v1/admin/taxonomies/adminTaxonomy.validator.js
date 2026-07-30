// src/api/v1/admin/taxonomies/adminTaxonomy.validator.js
import { z } from 'zod';

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('id must be a positive integer'),
});

const slugRule = z
  .string()
  .min(1)
  .max(191)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case');

export const createTaxonomySchema = z.object({
  name: z.string().trim().min(1, 'Tên không được để trống').max(100),
  slug: slugRule.optional(), // auto-generated from name when omitted
});

// name and slug both optional on update, but at least one must be present.
export const updateTaxonomySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    slug: slugRule.optional(),
  })
  .refine((v) => v.name !== undefined || v.slug !== undefined, {
    message: 'Cần ít nhất một trường (name hoặc slug) để cập nhật',
  });

export default { idParamSchema, createTaxonomySchema, updateTaxonomySchema };
