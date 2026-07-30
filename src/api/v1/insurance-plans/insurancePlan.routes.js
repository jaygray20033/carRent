// ─────────────────────────────────────────────────────────────────────
//  src/api/v1/insurance-plans/insurancePlan.routes.js
//  Day 12 — UC-15: Insurance plan routes
// ─────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import { listInsurancePlans } from './insurancePlan.controller.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: InsurancePlans
 *   description: Insurance plans (UC-15)
 *
 * /insurance-plans:
 *   get:
 *     tags: [InsurancePlans]
 *     summary: List all active insurance plans (Basic / Premium)
 *     responses:
 *       200:
 *         description: List of active insurance plans
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 message: { type: string }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       code: { type: string, enum: [BASIC, PREMIUM] }
 *                       name: { type: string }
 *                       description: { type: string }
 *                       ratePercent: { type: number, description: "Percent of base price charged as insurance fee", example: 10 }
 *                       isActive: { type: boolean }
 */
router.get('/', listInsurancePlans);

export default router;
