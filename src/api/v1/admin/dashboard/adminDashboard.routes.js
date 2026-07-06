// src/api/v1/admin/dashboard/adminDashboard.routes.js
// Admin dashboard KPI route (UC-52). ADMIN/OPERATOR only.
import { Router } from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { adminDashboardController } from './adminDashboard.controller.js';
import { dashboardQuerySchema } from './adminDashboard.validator.js';

const router = Router();

router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

router.get('/', validate(dashboardQuerySchema, 'query'), adminDashboardController.kpis);

export default router;
