// src/api/v1/admin/users/adminUser.validator.js
import { z } from 'zod';

const ROLE_CODES = ['CUSTOMER', 'ADMIN', 'OPERATOR', 'AGENT'];
const USER_STATUSES = ['ACTIVE', 'LOCKED', 'PENDING'];

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('id must be a positive integer'),
});

// GET /admin/users — list filters (UC-55).
export const adminListUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  role: z.enum(ROLE_CODES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  q: z.string().max(120).optional(),
});

// PATCH /admin/users/:id/status — ACTIVE | LOCKED (+ reason).
export const updateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'LOCKED']),
  reason: z.string().max(500).optional(),
});

// PATCH /admin/users/:id/role — change a user's role (ADMIN only).
export const updateRoleSchema = z.object({
  role: z.enum(ROLE_CODES),
});

// POST /admin/users/:id/wallet/adjust — manual CREDIT | DEBIT.
export const adjustWalletSchema = z.object({
  amount: z.coerce.number().positive('amount must be positive').max(1_000_000_000),
  type: z.enum(['CREDIT', 'DEBIT']),
  note: z.string().max(500).optional(),
});

export default {
  idParamSchema,
  adminListUsersQuerySchema,
  updateStatusSchema,
  updateRoleSchema,
  adjustWalletSchema,
};
