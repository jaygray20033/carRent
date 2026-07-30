// src/api/v1/me/addresses/address.validator.js
import { z } from 'zod';

const phoneRegex = /^0\d{9,10}$/;

// POST /me/addresses
export const createAddressSchema = z.object({
  contactName: z.string().trim().min(1, 'Tên người nhận là bắt buộc').max(120),
  contactPhone: z
    .string()
    .trim()
    .regex(phoneRegex, 'Số điện thoại không hợp lệ (VD: 0912345678)'),
  line: z.string().trim().min(1, 'Địa chỉ là bắt buộc').max(500),
  ward: z.string().trim().max(120).optional().or(z.literal('')),
  district: z.string().trim().max(120).optional().or(z.literal('')),
  city: z.string().trim().min(1, 'Tỉnh/Thành phố là bắt buộc').max(120),
  postalCode: z.string().trim().max(20).optional().or(z.literal('')),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isDefault: z.boolean().optional(),
});

// PATCH /me/addresses/:id — all fields optional
export const updateAddressSchema = createAddressSchema.partial();

// :id param
export const addressIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});
