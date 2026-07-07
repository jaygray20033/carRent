// src/api/v1/contact/contact.validator.js
// Day 36 (UC-28/29/30) — public contact form submission.
import { z } from 'zod';

export const createContactSchema = z.object({
  name: z.string().trim().min(2, 'Vui lòng nhập họ tên').max(120),
  email: z.string().trim().email('Email không hợp lệ').max(160),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\s-]{8,20}$/, 'Số điện thoại không hợp lệ')
    .optional()
    .or(z.literal('')),
  subject: z.string().trim().max(200).optional().or(z.literal('')),
  message: z.string().trim().min(10, 'Nội dung tối thiểu 10 ký tự').max(4000),
});

export default { createContactSchema };
