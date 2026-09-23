// src/api/v1/corporate/settlement.validator.js
import { z } from 'zod';

export const createSettlementSchema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
});

export const settlementIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const corporateIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listSettlementsQuerySchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'CONFIRMED', 'PAID', 'DISPUTED']).optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

// Global payment-confirmation queue (OtoRent staff). PAYMENT_DECLARED is the
// default the tab filters on, so it must be an allowed value here.
export const settlementQueueQuerySchema = z.object({
  status: z
    .enum(['DRAFT', 'SENT', 'CONFIRMED', 'PAYMENT_DECLARED', 'PAID', 'DISPUTED'])
    .optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

export const disputeSettlementSchema = z.object({
  note: z.string().trim().min(1, 'Vui lòng nhập lý do dispute').max(2000),
});

export const markPaidSchema = z.object({
  invoiceRef: z.string().trim().max(80).optional().nullable(),
});

export const dashboardQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM')
    .optional(),
});

export const tripsReportQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM')
    .optional(),
  employeeId: z.coerce.number().int().positive().optional(),
  status: z
    .enum([
      'PENDING',
      'APPROVED',
      'IN_PROGRESS',
      'PENDING_CONFIRM',
      'CONFIRMED',
      'SETTLED',
      'CANCELLED',
    ])
    .optional(),
});

export default {
  createSettlementSchema,
  settlementIdParamSchema,
  corporateIdParamSchema,
  listSettlementsQuerySchema,
  settlementQueueQuerySchema,
  disputeSettlementSchema,
  markPaidSchema,
  dashboardQuerySchema,
  tripsReportQuerySchema,
};
