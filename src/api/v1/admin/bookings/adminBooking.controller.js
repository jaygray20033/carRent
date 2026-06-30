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
};

export default adminBookingController;
