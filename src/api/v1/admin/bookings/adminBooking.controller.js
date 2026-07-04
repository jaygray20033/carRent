// src/api/v1/admin/bookings/adminBooking.controller.js
import { bookingService } from '../../bookings/booking.service.js';
import { success } from '../../../../utils/apiResponse.js';

export const adminBookingController = {
  // POST /admin/bookings/:id/refund — admin override, bypasses the time window.
  refund: async (req, res) => {
    const result = await bookingService.adminRefund(req.user.id, req.params.id, {
      reason: req.body?.reason,
      refundPercent: req.body?.refundPercent,
    });
    return success(res, result, 'Booking refunded (admin override)');
  },

  // POST /admin/bookings/:id/start — CONFIRMED → IN_USE at handover.
  start: async (req, res) => {
    const result = await bookingService.startRental(req.user.id, req.params.id);
    return success(res, result, 'Rental started');
  },

  // POST /admin/bookings/:id/return — IN_USE → COMPLETED on return.
  return: async (req, res) => {
    const result = await bookingService.returnRental(req.user.id, req.params.id, {
      extraFee: req.body?.extraFee,
      note: req.body?.note,
    });
    return success(res, result, 'Rental completed');
  },
};

export default adminBookingController;
