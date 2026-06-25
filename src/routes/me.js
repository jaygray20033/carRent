// ─────────────────────────────────────────────────────────────────────
//  src/routes/me.js — Current-user namespace ("/me")
//  Day 14: Booking history + List bookings of current user (UC-47, UC-48)
// ─────────────────────────────────────────────────────────────────────
const { Router } = require('express');
const { authenticate } = require('../middlewares/auth');
const {
  listMyBookings,
  getMyBookingDetail,
} = require('../controllers/meBookingController');

const router = Router();

// Everything under /me requires authentication
router.use(authenticate);

// GET /api/v1/me/bookings?status=&page=&limit=  — list my bookings (UC-47)
router.get('/bookings', listMyBookings);

// GET /api/v1/me/bookings/:id — my booking detail + history (UC-48)
router.get('/bookings/:id', getMyBookingDetail);

module.exports = router;
