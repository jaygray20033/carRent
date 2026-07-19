// Validators for admin supplier CRUD + dispatch.
import { z } from 'zod';

const optionalStr = (max = 191) =>
  z.string().trim().max(max).optional().nullable().or(z.literal(''));

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2).max(191),
  taxCode: z.string().trim().max(50).optional().nullable(),
  address: optionalStr(500),
  contactName: optionalStr(),
  contactPhone: optionalStr(30),
  contactEmail: z.string().trim().email().max(191).optional().nullable().or(z.literal('')),
  commissionRate: z.coerce.number().min(0).max(1).optional(),
  note: optionalStr(1000),
  contractRef: optionalStr(),
  contractStart: z.coerce.date().optional().nullable(),
  contractEnd: z.coerce.date().optional().nullable(),
  transportLicenseNo: optionalStr(),
  isActive: z.boolean().optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export const supplierIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const supplierMemberParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  memberId: z.coerce.number().int().positive(),
});

export const listSuppliersQuerySchema = z.object({
  q: z.string().trim().max(191).optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

export const inviteMemberSchema = z
  .object({
    phone: z.string().trim().max(30).optional().nullable(),
    email: z.string().trim().email().max(191).optional().nullable().or(z.literal('')),
    fullName: z.string().trim().max(191).optional().nullable(),
    isAdmin: z.boolean().optional(),
  })
  .refine((d) => d.phone || d.email, {
    message: 'Cần phone hoặc email để mời',
    path: ['phone'],
  });

export const updateMemberSchema = z.object({
  fullName: z.string().trim().max(191).optional().nullable(),
  isAdmin: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

// ── Dispatch (Phase B) ──────────────────────────────────────────────
export const dispatchSchema = z.object({
  supplierId: z.coerce.number().int().positive().optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
});

export const recallSchema = z.object({
  reason: z.string().trim().max(1000).optional().nullable(),
});

export const releaseDriverInfoSchema = z.object({
  fullName: z.string().trim().max(191).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  vehicleNote: z.string().trim().max(500).optional().nullable(),
  licensePlate: z.string().trim().max(30).optional().nullable(),
});

export const acceptSupplierInviteSchema = z.object({
  token: z.string().trim().min(8).max(128),
});

export default {
  createSupplierSchema,
  updateSupplierSchema,
  supplierIdParamSchema,
  supplierMemberParamSchema,
  listSuppliersQuerySchema,
  inviteMemberSchema,
  updateMemberSchema,
  dispatchSchema,
  recallSchema,
  releaseDriverInfoSchema,
  acceptSupplierInviteSchema,
};
