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

// ── Supplier settlement / payout (Phase E) ──────────────────────────
export const createSupplierSettlementSchema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  note: z.string().trim().max(2000).optional().nullable(),
});

export const listSupplierSettlementsQuerySchema = z.object({
  status: z
    .enum(['PENDING_DOCUMENTS', 'DOCUMENTS_SUBMITTED', 'DOCUMENTS_REJECTED', 'VERIFIED', 'PAID'])
    .optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

export const supplierSettlementIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const adminSupplierSettlementParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  settlementId: z.coerce.number().int().positive(),
});

export const submitSettlementDocumentsSchema = z.object({
  vatInvoiceRef: z.string().trim().min(1, 'Cần số hóa đơn GTGT').max(80),
  vatInvoiceUrl: z.string().trim().url('URL hóa đơn không hợp lệ').max(1000),
  statementUrl: z.string().trim().url('URL bảng kê không hợp lệ').max(1000),
  dispatchRecordsUrl: z.string().trim().url('URL lệnh điều xe không hợp lệ').max(1000),
  supportingDocumentsUrl: z
    .string()
    .trim()
    .url('URL chứng từ không hợp lệ')
    .max(1000)
    .optional()
    .nullable()
    .or(z.literal('')),
  note: z.string().trim().max(2000).optional().nullable(),
});

export const rejectSettlementDocumentsSchema = z.object({
  reason: z.string().trim().min(1, 'Vui lòng nhập lý do').max(2000),
});

export const markSupplierSettlementPaidSchema = z.object({
  paymentReference: z.string().trim().min(1, 'Cần mã giao dịch thanh toán').max(120),
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
  supplierSettlementIdParamSchema,
  adminSupplierSettlementParamSchema,
  createSupplierSettlementSchema,
  listSupplierSettlementsQuerySchema,
  submitSettlementDocumentsSchema,
  rejectSettlementDocumentsSchema,
  markSupplierSettlementPaidSchema,
};
