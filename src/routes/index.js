// src/routes/index.js
import { Router } from 'express';
import carsRoutes from './cars.routes.js';
import stationsRoutes from './stations.routes.js';
import brandsRoutes from './brands.routes.js';
import authRoutes from './auth.routes.js';
import { brandsCtrl } from './brands.routes.js';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth
router.use('/auth', authRoutes);

// Cars / Vehicles
router.use('/cars', carsRoutes);

// Stations
router.use('/stations', stationsRoutes);

// Brands
router.use('/brands', brandsRoutes);

// Categories (separate endpoint)
router.get('/categories', brandsCtrl.listCategories);

export default router;
