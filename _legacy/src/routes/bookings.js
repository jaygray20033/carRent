const { Router } = require('express');
const { authenticate } = require('../middlewares/auth');
const {
  createDraftBooking,
  confirmBooking,
  getBookingDetail,
  updateInsurance,
  applyCoupon,
} = require('../controllers/bookingController');

const router = Router();

// All booking routes require authentication
router.use(authenticate);

// POST /api/v1/bookings - Create DRAFT booking
router.post('/', createDraftBooking);

// GET /api/v1/bookings/:id - Get booking detail + breakdown
router.get('/:id', getBookingDetail);

// POST /api/v1/bookings/:id/confirm - Confirm booking (DRAFT → PENDING_PAYMENT)
router.post('/:id/confirm', confirmBooking);

// PATCH /api/v1/bookings/:id/insurance - Update insurance on DRAFT
router.patch('/:id/insurance', updateInsurance);

// PATCH /api/v1/bookings/:id/coupon - Apply/remove coupon on DRAFT
router.patch('/:id/coupon', applyCoupon);

module.exports = router;
