// src/api/v1/admin/index.js — gather admin modules (Day 8)
import { Router } from 'express';
import adminVehicleRoutes from './vehicles/adminVehicle.routes.js';
import adminVehicleModelRoutes from './vehicle-models/adminVehicleModel.routes.js';

const router = Router();

router.use('/vehicles', adminVehicleRoutes);
router.use('/vehicle-models', adminVehicleModelRoutes);

export default router;
