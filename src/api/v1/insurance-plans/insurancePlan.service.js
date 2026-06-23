// ─────────────────────────────────────────────────────────────────────
//  src/api/v1/insurance-plans/insurancePlan.service.js
//  Day 12 — UC-15: List insurance plans from DB
// ─────────────────────────────────────────────────────────────────────
import prisma from '../../../config/prisma.js';

export const insurancePlanService = {
  /**
   * List all active insurance plans (Basic / Premium).
   * @returns {Promise<Array>}
   */
  async list() {
    return prisma.insurancePlan.findMany({
      where: { isActive: true },
      orderBy: { ratePercent: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        ratePercent: true,
      },
    });
  },

  /**
   * Get a single insurance plan by ID.
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async getById(id) {
    return prisma.insurancePlan.findUnique({
      where: { id },
    });
  },
};

export default insurancePlanService;
