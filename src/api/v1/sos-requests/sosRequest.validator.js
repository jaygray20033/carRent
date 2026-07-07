// src/api/v1/sos-requests/sosRequest.validator.js
// Day 39 (UC-34/35/36) — SOS/roadside assistance request + operator dispatch.
import { z } from 'zod';

const ISSUE_TYPES = [
  'FLAT_TIRE',
  'DEAD_BATTERY',
  'ACCIDENT',
  'ENGINE',
  'OUT_OF_FUEL',
  'LOCKED_OUT',
  'OTHER',
];

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('id must be a positive integer'),
});

export const createSosSchema = z.object({
  bookingId: z.coerce.number().int().positive('Thiếu mã chuyến đi'),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  issueType: z.enum(ISSUE_TYPES),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
});

export const listQuerySchema = z.object({
  status: z
    .enum(['REQUESTED', 'DISPATCHED', 'ON_THE_WAY', 'RESOLVED', 'CANCELLED'])
    .optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

// Operator dispatch update. When moving to DISPATCHED, driver info is required.
export const updateSosSchema = z
  .object({
    status: z.enum(['DISPATCHED', 'ON_THE_WAY', 'RESOLVED', 'CANCELLED']),
    rescueStationId: z.coerce.number().int().positive().optional(),
    driverName: z.string().trim().max(160).optional().or(z.literal('')),
    driverPhone: z
      .string()
      .trim()
      .regex(/^[0-9+\s-]{8,20}$/, 'Số điện thoại không hợp lệ')
      .optional()
      .or(z.literal('')),
    etaMinutes: z.coerce.number().int().min(0).max(1440).optional(),
    resolutionNote: z.string().trim().max(2000).optional().or(z.literal('')),
  })
  .refine(
    (v) => v.status !== 'DISPATCHED' || (v.driverName && v.driverName.trim().length > 0),
    { message: 'Vui lòng nhập tên tài xế khi điều phối', path: ['driverName'] }
  );

export const replacementSchema = z.object({
  vehicleId: z.coerce.number().int().positive('Thiếu xe thay thế'),
  pickupStationId: z.coerce.number().int().positive().optional(),
  note: z.string().trim().max(2000).optional().or(z.literal('')),
});

export default {
  idParamSchema,
  createSosSchema,
  listQuerySchema,
  updateSosSchema,
  replacementSchema,
};
