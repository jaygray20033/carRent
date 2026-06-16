// src/api/v1/index.js — Gather all v1 modules
import { Router } from 'express';
import authRoutes from './auth/auth.routes.js';
import userRoutes from './users/user.routes.js';
import carRoutes from './cars/car.routes.js';
import bookingRoutes from './bookings/booking.routes.js';
import paymentRoutes from './payments/payment.routes.js';
import stationRoutes from './stations/station.routes.js';

const router = Router();

router.get('/', (_req, res) =>
  res.json({
    name: 'CarRent API v1',
    status: 'running',
    endpoints: [
      '/auth',
      '/users',
      '/cars',
      '/bookings',
      '/payments',
      '/stations',
    ],
  })
);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/cars', carRoutes);
router.use('/bookings', bookingRoutes);
router.use('/payments', paymentRoutes);
router.use('/stations', stationRoutes);

export default router;
