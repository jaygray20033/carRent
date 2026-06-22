// src/api/v1/index.js — Gather all v1 modules
import { Router } from 'express';
import authRoutes from './auth/auth.routes.js';
import userRoutes from './users/user.routes.js';
import carRoutes from './cars/car.routes.js';
import bookingRoutes from './bookings/booking.routes.js';
import paymentRoutes from './payments/payment.routes.js';
import stationRoutes from './stations/station.routes.js';
import brandRoutes from './brands/brand.routes.js';
import vehicleModelRoutes from './vehicle-models/vehicleModel.routes.js';
import categoryRoutes from './categories/category.routes.js';
import postRoutes from './posts/post.routes.js';
import adminRoutes from './admin/index.js';

const router = Router();

router.get('/', (_req, res) =>
  res.json({
    name: 'OtoRent API v1',
    status: 'running',
    endpoints: [
      '/auth',
      '/users',
      '/cars',
      '/bookings',
      '/payments',
      '/stations',
      '/brands',
      '/vehicle-models',
      '/categories',
      '/posts',
      '/admin/vehicles',
      '/admin/vehicle-models',
    ],
  })
);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/cars', carRoutes);
router.use('/bookings', bookingRoutes);
router.use('/payments', paymentRoutes);
router.use('/stations', stationRoutes);
router.use('/brands', brandRoutes);
router.use('/vehicle-models', vehicleModelRoutes);
router.use('/categories', categoryRoutes);
router.use('/posts', postRoutes);
router.use('/admin', adminRoutes);

export default router;
