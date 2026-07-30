// src/api/v1/admin/rescue-stations/adminRescueStation.validator.js
// Day 37 (UC-31) — admin rescue station CRUD validation.
import { z } from 'zod';

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('id must be a positive integer'),
});

export const listQuerySchema = z.object({
  q: z.string().trim().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

const baseFields = {
  name: z.string().trim().min(2, 'Tên tối thiểu 2 ký tự').max(160),
  city: z.string().trim().max(120).optional().or(z.literal('')),
  district: z.string().trim().max(120).optional().or(z.literal('')),
  address: z.string().trim().min(3, 'Địa chỉ tối thiểu 3 ký tự').max(300),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\s-]{8,20}$/, 'Số điện thoại không hợp lệ')
    .optional()
    .or(z.literal('')),
  hours: z.string().trim().max(160).optional().or(z.literal('')),
  isActive: z.boolean().optional(),
};

export const createStationSchema = z.object(baseFields);

export const updateStationSchema = z
  .object(
    Object.fromEntries(Object.entries(baseFields).map(([k, schema]) => [k, schema.optional()]))
  )
  .refine((v) => Object.keys(v).length > 0, { message: 'Cần ít nhất một trường để cập nhật' });

export default { idParamSchema, listQuerySchema, createStationSchema, updateStationSchema };
