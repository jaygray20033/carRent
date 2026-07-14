// src/api/v1/admin/index.js — gather admin modules (Day 8)
import { Router } from 'express';
import adminVehicleRoutes from './vehicles/adminVehicle.routes.js';
import adminVehicleModelRoutes from './vehicle-models/adminVehicleModel.routes.js';
import adminBookingRoutes from './bookings/adminBooking.routes.js';
import adminUserRoutes from './users/adminUser.routes.js';
import adminCommentRoutes from './comments/adminComment.routes.js';
import adminPostRoutes from './posts/adminPost.routes.js';
import { adminCategoryRoutes, adminTagRoutes } from './taxonomies/adminTaxonomy.routes.js';
import adminCouponRoutes from './coupons/adminCoupon.routes.js';
import adminDashboardRoutes from './dashboard/adminDashboard.routes.js';
import adminReportsRoutes from './reports/adminReports.routes.js';
import adminSettingsRoutes from './settings/adminSettings.routes.js';
import adminContactRoutes from './contact-messages/adminContact.routes.js';
import adminRescueStationRoutes from './rescue-stations/adminRescueStation.routes.js';
import adminAgentApplicationRoutes from './agent-applications/adminAgentApplication.routes.js';
import adminSosRequestRoutes from './sos-requests/adminSosRequest.routes.js';
import adminCorporateClientRoutes from './corporate-clients/adminCorporateClient.routes.js';
import adminCorporateBookingRoutes from './corporate-bookings/adminCorporateBooking.routes.js';
import adminSettlementRoutes from './settlements/adminSettlement.routes.js';
import adminVasRoutes from './vas/adminVas.routes.js';
import adminSlaViolationRoutes from './sla-violations/adminSlaViolation.routes.js';

const router = Router();

router.use('/dashboard', adminDashboardRoutes);
router.use('/reports', adminReportsRoutes);
router.use('/settings', adminSettingsRoutes);
router.use('/vehicles', adminVehicleRoutes);
router.use('/vehicle-models', adminVehicleModelRoutes);
router.use('/bookings', adminBookingRoutes);
router.use('/users', adminUserRoutes);
router.use('/comments', adminCommentRoutes);
router.use('/posts', adminPostRoutes);
router.use('/post-categories', adminCategoryRoutes);
router.use('/tags', adminTagRoutes);
router.use('/coupons', adminCouponRoutes);
router.use('/contact-messages', adminContactRoutes);
router.use('/rescue-stations', adminRescueStationRoutes);
router.use('/agent-applications', adminAgentApplicationRoutes);
router.use('/sos-requests', adminSosRequestRoutes);
router.use('/corporate-clients', adminCorporateClientRoutes);
router.use('/corporate-bookings', adminCorporateBookingRoutes);
router.use('/settlements', adminSettlementRoutes);
router.use('/vas', adminVasRoutes);
router.use('/sla-violations', adminSlaViolationRoutes);

export default router;
