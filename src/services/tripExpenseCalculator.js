// B2B Day 4 + ENT-Day 2 — Cost summary for a corporate trip.
// Integer VND arithmetic only (no float drift).

/**
 * Build cost summary from basePrice + expenses + VAS.
 * Only expenses with approvedByAdmin === true count toward subtotal.
 * VAS lines with status !== CANCELLED count (PENDING still committed).
 * VAT = 10% of subtotal (base + approved expenses + active VAS).
 *
 * @param {{
 *   basePrice: number,
 *   expenses?: Array<{ type, amount, description?, approvedByAdmin? }>,
 *   vasLines?: Array<{ name?, vas?, headcount, unitPrice, totalPrice?, status? }>
 * }} input
 */
export function buildCostSummary({ basePrice, expenses = [], vasLines = [] }) {
  const base = Math.round(Number(basePrice) || 0);
  const lines = [];
  let expenseTotal = 0;

  for (const e of expenses) {
    const amount = Math.round(Number(e.amount) || 0);
    const approved = e.approvedByAdmin === true;
    if (approved) {
      expenseTotal += amount;
      lines.push({
        id: e.id ?? null,
        type: e.type,
        amount,
        description: e.description ?? null,
        approvedByAdmin: true,
      });
    }
  }

  const vas = [];
  let vasTotal = 0;
  for (const v of vasLines) {
    if (v.status === 'CANCELLED') continue;
    const headcount = Math.round(Number(v.headcount) || 0);
    const unitPrice = Math.round(Number(v.unitPrice) || 0);
    const total =
      v.totalPrice != null
        ? Math.round(Number(v.totalPrice) || 0)
        : headcount * unitPrice;
    vasTotal += total;
    vas.push({
      id: v.id ?? null,
      name: v.name || v.vas?.name || null,
      code: v.code || v.vas?.code || null,
      headcount,
      unitPrice,
      total,
      status: v.status || 'PENDING',
    });
  }

  const subtotal = base + expenseTotal + vasTotal;
  const vat10 = Math.round(subtotal * 0.1);
  const total = subtotal + vat10;

  return {
    basePrice: base,
    expenses: lines,
    expenseTotal,
    vas,
    vasTotal,
    subtotal,
    vat10,
    total,
  };
}

/**
 * Calculate variable expense amounts (EXTRA_KM / OVERTIME / OVERNIGHT / ONE_WAY_KM).
 * Delegates unit rates to corporatePricing.service.
 */
export { suggestExpenseAmount } from './corporatePricing.service.js';

export default { buildCostSummary };
