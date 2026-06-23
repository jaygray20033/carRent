// ─────────────────────────────────────────────────────────────────────
//  src/api/v1/insurance-plans/insurancePlan.controller.js
//  Day 12 — UC-15: GET /insurance-plans
// ─────────────────────────────────────────────────────────────────────
import { insurancePlanService } from './insurancePlan.service.js';

/**
 * GET /api/v1/insurance-plans
 * List all active insurance plans (Basic / Premium).
 */
export async function listInsurancePlans(_req, res, next) {
  try {
    const plans = await insurancePlanService.list();

    return res.status(200).json({
      status: 'success',
      message: 'Insurance plans retrieved',
      data: plans,
    });
  } catch (error) {
    next(error);
  }
}

export default { listInsurancePlans };
