// ENT-Day 3 — SLA + amendment validators
import { z } from 'zod';

export const createSlaSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9_]+$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  targetValue: z.string().trim().max(200).optional().nullable(),
  penaltyRule: z.string().trim().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const updateSlaSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  targetValue: z.string().trim().max(200).optional().nullable(),
  penaltyRule: z.string().trim().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const slaIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  slaId: z.coerce.number().int().positive(),
});

export const reportViolationSchema = z.object({
  slaId: z.coerce.number().int().positive(),
  description: z.string().trim().min(3).max(2000),
  severity: z.enum(['MINOR', 'MAJOR', 'CRITICAL']).default('MINOR'),
  evidenceUrls: z.array(z.string().url()).max(10).optional().nullable(),
});

export const violationIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const confirmViolationSchema = z.object({
  resolution: z.string().trim().max(2000).optional().nullable(),
});

export const adminListViolationsQuerySchema = z.object({
  isConfirmed: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  severity: z.enum(['MINOR', 'MAJOR', 'CRITICAL']).optional(),
  corporateId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

export const createAmendmentSchema = z.object({
  amendmentNo: z.string().trim().min(1).max(40),
  title: z.string().trim().min(2).max(200),
  content: z.string().trim().min(2).max(10000),
  effectiveDate: z.coerce.date(),
  documentUrl: z.string().url().optional().nullable(),
  priceConfigDelta: z.record(z.any()).optional().nullable(),
});

export const amendmentIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  amendmentId: z.coerce.number().int().positive().optional(),
});

// For nested routes /:id/amendments/:amendmentId
export const corporateAmendmentParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  amendmentId: z.coerce.number().int().positive(),
});

export const corporateSlaParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  slaId: z.coerce.number().int().positive(),
});

export default {
  createSlaSchema,
  updateSlaSchema,
  slaIdParamSchema,
  reportViolationSchema,
  violationIdParamSchema,
  confirmViolationSchema,
  adminListViolationsQuerySchema,
  createAmendmentSchema,
  amendmentIdParamSchema,
  corporateAmendmentParamSchema,
  corporateSlaParamSchema,
};
