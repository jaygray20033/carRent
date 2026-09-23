// B2B Day 5 — Settlement totals from CONFIRMED bookings in a period.
// Integer VND math only.
import { buildCostSummary } from './tripExpenseCalculator.js';

/**
 * Filter bookings eligible for a settlement period.
 * Only CONFIRMED status; completedAt (fallback pickupAt) within [periodStart, periodEnd].
 */
export function filterBookingsForPeriod(bookings, periodStart, periodEnd) {
  const start = new Date(periodStart).getTime();
  const end = new Date(periodEnd).getTime();
  return (bookings || []).filter((b) => {
    if (b.status !== 'CONFIRMED') return false;
    const t = new Date(b.completedAt || b.pickupAt).getTime();
    return t >= start && t <= end;
  });
}

/**
 * Aggregate settlement totals from a list of CONFIRMED bookings (with expenses).
 * @returns {{ totalBaseAmount, totalExpenses, totalVat, totalAmount, bookingCount, lines }}
 */
export function calculateSettlementTotals(bookings) {
  let totalBaseAmount = 0;
  let totalExpenses = 0;
  const lines = [];

  let totalVas = 0;
  for (const b of bookings) {
    const summary = buildCostSummary({
      basePrice: b.basePrice,
      expenses: b.expenses || [],
      vasLines: b.bookingVAS || b.bookingVas || [],
    });
    totalBaseAmount += summary.basePrice;
    totalExpenses += summary.expenseTotal;
    totalVas += summary.vasTotal || 0;
    lines.push({
      bookingId: b.id,
      basePrice: summary.basePrice,
      expenseTotal: summary.expenseTotal,
      vasTotal: summary.vasTotal || 0,
      subtotal: summary.subtotal,
      vat10: summary.vat10,
      total: summary.total,
    });
  }

  // Integer arithmetic throughout
  totalBaseAmount = Math.round(totalBaseAmount);
  totalExpenses = Math.round(totalExpenses);
  totalVas = Math.round(totalVas);
  const subtotal = totalBaseAmount + totalExpenses + totalVas;
  const totalVat = Math.round(subtotal * 0.1);
  const totalAmount = subtotal + totalVat;

  return {
    totalBaseAmount,
    totalExpenses,
    totalVat,
    totalAmount,
    bookingCount: bookings.length,
    lines,
  };
}

export default { filterBookingsForPeriod, calculateSettlementTotals };
