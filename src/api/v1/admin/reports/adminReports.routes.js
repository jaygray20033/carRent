// src/api/v1/admin/reports/adminReports.routes.js
// Day 35 (UC-59) — admin reports. ADMIN/OPERATOR only.
import { Router } from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { adminReportsController } from './adminReports.controller.js';
import {
  revenueQuerySchema,
  bookingQuerySchema,
  topVehiclesQuerySchema,
} from './adminReports.validator.js';

const router = Router();

router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

/**
 * @swagger
 * /admin/reports/revenue:
 *   get:
 *     tags: [Admin - Reports]
 *     summary: Revenue report (UC-59) — SUCCESS payments by day|month + method breakdown
 *     description: >
 *       Returns JSON by default. Pass ?format=csv|excel|pdf to download the
 *       report as a file instead.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: group
 *         schema: { type: string, enum: [day, month] }
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [csv, excel, pdf] }
 *     responses:
 *       200: { description: Revenue report (JSON or file download) }
 */
router.get(
  '/revenue',
  validate(revenueQuerySchema, 'query'),
  adminReportsController.revenue
);

/**
 * @swagger
 * /admin/reports/booking:
 *   get:
 *     tags: [Admin - Reports]
 *     summary: Booking report (UC-59) — booking counts grouped by status
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200: { description: Booking counts by status }
 */
router.get(
  '/booking',
  validate(bookingQuerySchema, 'query'),
  adminReportsController.booking
);

/**
 * @swagger
 * /admin/reports/top-vehicles:
 *   get:
 *     tags: [Admin - Reports]
 *     summary: Top vehicles report (UC-59) — most-booked vehicles in range
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 50 }
 *     responses:
 *       200: { description: Top vehicles by booking count }
 */
router.get(
  '/top-vehicles',
  validate(topVehiclesQuerySchema, 'query'),
  adminReportsController.topVehicles
);

export default router;
