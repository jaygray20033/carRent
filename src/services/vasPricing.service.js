// ENT-Day 2 — resolve negotiated VAS unit price + line totals (integer VND).
import prisma from '../config/db.js';
import { NotFoundError, UnprocessableError } from '../utils/apiError.js';

/**
 * Resolve unit price for a corporate client + VAS.
 * Prefer CorporateVASPrice; fall back to ValueAddedService.basePrice.
 */
export async function resolveVasUnitPrice(corporateId, vasId, { requireActive = true } = {}) {
  const vas = await prisma.valueAddedService.findUnique({ where: { id: Number(vasId) } });
  if (!vas) throw new NotFoundError('Value-added service');
  if (requireActive && !vas.isActive) {
    throw new NotFoundError('Value-added service');
  }

  const negotiated = await prisma.corporateVASPrice.findUnique({
    where: {
      corporateId_vasId: {
        corporateId: Number(corporateId),
        vasId: Number(vasId),
      },
    },
  });

  const unitPrice = Math.round(Number(negotiated?.price ?? vas.basePrice) || 0);
  return { vas, unitPrice, negotiated: Boolean(negotiated) };
}

/**
 * Compute totalPrice = headcount × unitPrice with integer VND math.
 * @throws UnprocessableError INVALID_HEADCOUNT when headcount < 1
 * @throws UnprocessableError VAS_INACTIVE when vas inactive (if checked)
 */
export function computeVasLineTotal({ headcount, unitPrice, vas }) {
  const hc = Math.round(Number(headcount));
  if (!Number.isFinite(hc) || hc < 1) {
    throw new UnprocessableError('headcount phải >= 1', 'INVALID_HEADCOUNT');
  }
  if (vas && vas.isActive === false) {
    throw new UnprocessableError('VAS đang ngưng hoạt động', 'VAS_INACTIVE');
  }
  const unit = Math.round(Number(unitPrice) || 0);
  const totalPrice = hc * unit;
  return { headcount: hc, unitPrice: unit, totalPrice };
}

/**
 * Pricing table for a corporate client: all active VAS with negotiated override if any.
 */
export async function listCorporateVasPricing(corporateId) {
  const [catalog, prices] = await Promise.all([
    prisma.valueAddedService.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    }),
    prisma.corporateVASPrice.findMany({
      where: { corporateId: Number(corporateId) },
    }),
  ]);
  const priceMap = new Map(prices.map((p) => [p.vasId, p]));

  return catalog.map((vas) => {
    const negotiated = priceMap.get(vas.id);
    const unitPrice = Math.round(Number(negotiated?.price ?? vas.basePrice) || 0);
    return {
      vasId: vas.id,
      code: vas.code,
      name: vas.name,
      description: vas.description,
      unit: vas.unit,
      requiresHeadcount: vas.requiresHeadcount,
      basePrice: Math.round(Number(vas.basePrice) || 0),
      unitPrice,
      isNegotiated: Boolean(negotiated),
      note: negotiated?.note ?? null,
    };
  });
}

export default {
  resolveVasUnitPrice,
  computeVasLineTotal,
  listCorporateVasPricing,
};
