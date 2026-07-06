// src/api/v1/admin/bookings/adminBooking.controller.js
import { bookingService } from '../../bookings/booking.service.js';
import { adminBookingService } from './adminBooking.service.js';
import { success, paginated } from '../../../../utils/apiResponse.js';

export const adminBookingController = {
  // GET /admin/bookings — filterable list (UC-54).
  list: async (req, res) => {
    const result = await adminBookingService.list(req.query);
    return paginated(res, result.items, {
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  },

  // GET /admin/bookings/:id — full detail + payments + history timeline.
  detail: async (req, res) => {
    const booking = await adminBookingService.getById(req.params.id);
    return success(res, { booking }, 'Booking detail');
  },

  // POST /admin/bookings/:id/note — internal note (timeline entry).
  note: async (req, res) => {
    const booking = await adminBookingService.addNote(req.user.id, req.params.id, req.body.note);
    return success(res, { booking }, 'Note added');
  },

  // POST /admin/bookings/:id/confirm-payment — manual offline settlement.
  confirmPayment: async (req, res) => {
    const booking = await adminBookingService.confirmPayment(req.user.id, req.params.id, {
      method: req.body?.method,
      note: req.body?.note,
    });
    return success(res, { booking }, 'Payment confirmed');
  },

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
