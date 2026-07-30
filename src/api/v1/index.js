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
import insurancePlanRoutes from './insurance-plans/insurancePlan.routes.js';
import couponRoutes from './coupons/coupon.routes.js';
import walletRoutes from './wallet/wallet.routes.js';
import addressRoutes from './me/addresses/address.routes.js';
import notificationRoutes from './notifications/notification.routes.js';
import contactRoutes from './contact/contact.routes.js';
import roadsideStationRoutes from './roadside-stations/roadsideStation.routes.js';
import agentApplicationRoutes from './agent-applications/agentApplication.routes.js';
import supplierApplicationRoutes from './supplier-applications/supplierApplication.routes.js';
import sosRequestRoutes from './sos-requests/sosRequest.routes.js';
import adminRoutes from './admin/index.js';
import corporateRoutes from './corporate/corporate.routes.js';
import supplierRoutes from './supplier/supplierPortal.routes.js';
import { publicCache } from '../../middlewares/cacheControl.middleware.js';
import { corporateController } from './corporate/corporate.controller.js';

const router = Router();

router.get('/', (_req, res) =>
  res.json({
    name: 'CarGoGo API v1',
    status: 'running',
    endpoints: [
      '/auth',
      '/me',
      '/me/avatar',
      '/me/change-password',
      '/me/change-phone',
      '/cars',
      '/bookings',
      '/payments',
      '/stations',
      '/brands',
      '/vehicle-models',
      '/categories',
      '/posts',
      '/insurance-plans',
      '/coupons',
      '/me/wallet',
      '/me/wallet/transactions',
      '/me/wallet/topup',
      '/contact-messages',
      '/site-settings/contact',
      '/roadside-stations',
      '/admin/vehicles',
      '/admin/vehicle-models',
      '/admin/bookings',
      '/admin/contact-messages',
      '/admin/rescue-stations',
    ],
  })
);

router.use('/auth', authRoutes);
router.use('/cars', publicCache({ maxAge: 60, sMaxAge: 300 }), carRoutes);
router.use('/bookings', bookingRoutes);
router.use('/payments', paymentRoutes);
router.use('/stations', stationRoutes);
router.use('/brands', brandRoutes);
router.use('/vehicle-models', vehicleModelRoutes);
router.use('/categories', categoryRoutes);
router.use('/posts', publicCache({ maxAge: 60, sMaxAge: 300 }), postRoutes);
router.use('/insurance-plans', insurancePlanRoutes);
router.use('/coupons', couponRoutes);
router.use('/me/wallet', walletRoutes);
router.use('/me/addresses', addressRoutes);
router.use('/me/notifications', notificationRoutes);
router.use('/roadside-stations', roadsideStationRoutes);
// Contact router owns both /contact-messages and /site-settings/contact.
router.use('/', contactRoutes);
// Agent-application router owns /agent-applications and /me/agent-application.
router.use('/', agentApplicationRoutes);
// Supplier-application router owns /supplier-applications and /me/supplier-application.
router.use('/', supplierApplicationRoutes);
router.use('/sos-requests', sosRequestRoutes);
// ENT-Day 2 — public VAS catalog (active only).
router.get('/vas', corporateController.listActiveVas);
router.use('/corporate', corporateRoutes);
router.use('/supplier', supplierRoutes);
router.use('/me', userRoutes);
router.use('/admin', adminRoutes);

export default router;
