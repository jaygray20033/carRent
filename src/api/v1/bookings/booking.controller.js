// src/api/v1/bookings/booking.controller.js
import { bookingService } from './booking.service.js';
import { success, created, paginated } from '../../../utils/apiResponse.js';

export const bookingController = {
  create: async (req, res) => {
    const booking = await bookingService.create(req.user.id, req.body);
    return created(res, { booking }, 'Booking created');
  },

  listMy: async (req, res) => {
    const result = await bookingService.listByUser(req.user.id, req.query);
    return paginated(res, result.items, {
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  },

  detail: async (req, res) => {
    const booking = await bookingService.getById(
      req.user.id,
      req.user.roleCode,
      req.params.id
    );
    return success(res, { booking });
  },

  cancel: async (req, res) => {
    const booking = await bookingService.cancel(
      req.user.id,
      req.user.roleCode,
      req.params.id,
      req.body.reason
    );
    return success(res, { booking }, 'Booking cancelled');
  },
};
