// src/api/v1/corporate/corporateClient.validator.js
import { z } from 'zod';

const taxCodeSchema = z
  .string()
  .trim()
  .min(10)
  .max(14)
  .regex(/^\d{10}(-?\d{0,3})?$/, 'Mã số thuế phải gồm 10–13 chữ số');

export const createCorporateClientSchema = z.object({
  name: z.string().trim().min(2).max(200),
  taxCode: taxCodeSchema,
  address: z.string().trim().max(500).optional().nullable(),
  contactName: z.string().trim().max(120).optional().nullable(),
  contactPhone: z.string().trim().max(20).optional().nullable(),
  contactEmail: z.string().trim().email().optional().nullable().or(z.literal('')),
  contractRef: z.string().trim().max(80).optional().nullable(),
  contractStart: z.coerce.date().optional().nullable(),
  contractEnd: z.coerce.date().optional().nullable(),
  creditLimit: z.coerce.number().min(0).optional(),
  paymentTermDays: z.coerce.number().int().min(0).max(365).optional(),
  isActive: z.boolean().optional(),
  priceConfig: z.record(z.any()).optional(),
});

export const updateCorporateClientSchema = createCorporateClientSchema.partial().extend({
  taxCode: taxCodeSchema.optional(),
});

export const listCorporateClientsQuerySchema = z.object({
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

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const priceConfigSchema = z.object({
  priceConfig: z.record(z.any()),
});

export default {
  createCorporateClientSchema,
  updateCorporateClientSchema,
  listCorporateClientsQuerySchema,
  idParamSchema,
  priceConfigSchema,
};
