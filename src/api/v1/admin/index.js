// src/api/v1/admin/index.js — gather admin modules (Day 8)
import { Router } from 'express';
import adminVehicleRoutes from './vehicles/adminVehicle.routes.js';
import adminVehicleModelRoutes from './vehicle-models/adminVehicleModel.routes.js';
import adminBookingRoutes from './bookings/adminBooking.routes.js';

const router = Router();

router.use('/vehicles', adminVehicleRoutes);
router.use('/vehicle-models', adminVehicleModelRoutes);
router.use('/bookings', adminBookingRoutes);

export default router;
