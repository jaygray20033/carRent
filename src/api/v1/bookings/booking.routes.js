// ─────────────────────────────────────────────────────────────────────
//  src/api/v1/bookings/booking.routes.js — Booking routes
// ─────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import { createDraft } from './booking.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';

const router = Router();

/**
 * POST /api/v1/bookings/draft
 * @description Create a draft booking (UC-14)
 * @access Private (requires authentication)
 */
router.post('/draft', authenticate, createDraft);

export default router;
