// ─────────────────────────────────────────────────────────────────────
//  src/api/v1/insurance-plans/insurancePlan.routes.js
//  Day 12 — UC-15: Insurance plan routes
// ─────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import { listInsurancePlans } from './insurancePlan.controller.js';

const router = Router();

/**
 * GET /api/v1/insurance-plans
 * @description List all active insurance plans (Basic / Premium)
 * @access Public
 */
router.get('/', listInsurancePlans);

export default router;
