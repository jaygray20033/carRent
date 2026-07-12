// src/api/v1/corporate/corporateEmployee.validator.js
import { z } from 'zod';

export const inviteEmployeeSchema = z
  .object({
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+]{8,15}$/, 'Số điện thoại không hợp lệ')
      .optional(),
    email: z.string().trim().email().optional(),
    department: z.string().trim().max(120).optional().nullable(),
    employeeCode: z.string().trim().max(60).optional().nullable(),
    isAdmin: z.boolean().optional().default(false),
  })
  .refine((v) => Boolean(v.phone || v.email), {
    message: 'Cần phone hoặc email',
    path: ['phone'],
  });

export const acceptInviteSchema = z.object({
  token: z.string().trim().min(16).max(128),
});

export const updateEmployeeSchema = z.object({
  department: z.string().trim().max(120).optional().nullable(),
  employeeCode: z.string().trim().max(60).optional().nullable(),
  isAdmin: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const listEmployeesQuerySchema = z.object({
  q: z.string().trim().optional(),
  isActive: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      return v === 'true' || v === '1';
    }),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

export const employeeIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export default {
  inviteEmployeeSchema,
  acceptInviteSchema,
  updateEmployeeSchema,
  listEmployeesQuerySchema,
  employeeIdParamSchema,
};
