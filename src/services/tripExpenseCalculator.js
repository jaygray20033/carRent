// B2B Day 4 — Cost summary for a corporate trip.
// Integer VND arithmetic only (no float drift).

/**
 * Build cost summary from basePrice + expenses.
 * Only expenses with approvedByAdmin === true count toward subtotal.
 * VAT = 10% of subtotal (base + approved expenses).
 *
 * @param {{ basePrice: number, expenses: Array<{ type, amount, description?, approvedByAdmin? }> }} input
 */
export function buildCostSummary({ basePrice, expenses = [] }) {
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

  const subtotal = base + expenseTotal;
  const vat10 = Math.round(subtotal * 0.1);
  const total = subtotal + vat10;

  return {
    basePrice: base,
    expenses: lines,
    expenseTotal,
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
