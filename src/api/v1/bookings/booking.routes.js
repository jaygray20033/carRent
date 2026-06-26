// ─────────────────────────────────────────────────────────────────────
//  src/api/v1/bookings/booking.routes.js — Booking routes
//    UC-14 createDraft · UC-15 updateDraft · UC-16 confirm
// ─────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import {
  createDraft,
  updateDraft,
  confirmBooking,
  listMyBookings,
  getBookingDetail,
  cancelBooking,
} from './booking.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';

const router = Router();

// All booking routes require authentication.
router.use(authenticate);

// POST /api/v1/bookings/draft — create a DRAFT booking (UC-14)
router.post('/draft', createDraft);

// GET /api/v1/bookings — list current user's bookings
router.get('/', listMyBookings);

// GET /api/v1/bookings/:id — booking detail (owner / ADMIN / OPERATOR)
router.get('/:id', getBookingDetail);

// PATCH /api/v1/bookings/:id — update a DRAFT (insurance, dropoff) (UC-15)
router.patch('/:id', updateDraft);

// POST /api/v1/bookings/:id/confirm — DRAFT → PENDING_PAYMENT (UC-16)
router.post('/:id/confirm', confirmBooking);

// POST /api/v1/bookings/:id/cancel — cancel a booking
router.post('/:id/cancel', cancelBooking);

export default router;
