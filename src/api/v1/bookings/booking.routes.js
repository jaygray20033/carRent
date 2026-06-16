// src/api/v1/bookings/booking.routes.js
import { Router } from 'express';
import { bookingController } from './booking.controller.js';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import {
  createBookingSchema,
  listBookingsQuerySchema,
  cancelBookingSchema,
} from './booking.validator.js';

const router = Router();
router.use(authenticate);

router.post('/', validate(createBookingSchema), asyncHandler(bookingController.create));
router.get('/', validate(listBookingsQuerySchema, 'query'), asyncHandler(bookingController.listMy));
router.get('/:id', asyncHandler(bookingController.detail));
router.patch(
  '/:id/cancel',
  validate(cancelBookingSchema),
  asyncHandler(bookingController.cancel)
);

export default router;
