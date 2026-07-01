// src/api/v1/admin/index.js — gather admin modules (Day 8)
import { Router } from 'express';
import adminVehicleRoutes from './vehicles/adminVehicle.routes.js';
import adminVehicleModelRoutes from './vehicle-models/adminVehicleModel.routes.js';
import adminBookingRoutes from './bookings/adminBooking.routes.js';
import adminCommentRoutes from './comments/adminComment.routes.js';
import adminPostRoutes from './posts/adminPost.routes.js';
import { adminCategoryRoutes, adminTagRoutes } from './taxonomies/adminTaxonomy.routes.js';
import adminCouponRoutes from './coupons/adminCoupon.routes.js';

const router = Router();

router.use('/vehicles', adminVehicleRoutes);
router.use('/vehicle-models', adminVehicleModelRoutes);
router.use('/bookings', adminBookingRoutes);
router.use('/comments', adminCommentRoutes);
router.use('/posts', adminPostRoutes);
router.use('/post-categories', adminCategoryRoutes);
router.use('/tags', adminTagRoutes);
router.use('/coupons', adminCouponRoutes);

export default router;
