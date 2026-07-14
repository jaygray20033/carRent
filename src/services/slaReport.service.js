// ENT-Day 3 — pure helpers for SLA report / termination risk (unit-testable).

/**
 * Build contract-termination risk flags from confirmed CRITICAL count.
 * - 0 CRITICAL → risk=false, warning=false
 * - 1 CRITICAL → risk=false, warning=true
 * - ≥2 CRITICAL → risk=true, warning=true
 */
export function evaluateTerminationRisk(criticalCount) {
  const n = Math.max(0, Math.round(Number(criticalCount) || 0));
  const contractTerminationRisk = n >= 2;
  const warningFlag = n >= 1;
  let warningMessage;
  if (n === 0) {
    warningMessage = null;
  } else if (n === 1) {
    warningMessage =
      'Tài xế/dịch vụ vi phạm nghiêm trọng 1 lần — thêm 1 lần CRITICAL sẽ đủ điều kiện chấm dứt HĐ';
  } else {
    warningMessage = `Đã có ${n} vi phạm CRITICAL trong thời hạn HĐ — đủ điều kiện chấm dứt HĐ theo Điều 3`;
  }
  return { criticalCount: n, contractTerminationRisk, warningFlag, warningMessage };
}

/**
 * violationRate = (confirmedViolations / totalTrips) * 100, 1 decimal place.
 * Returns string like "6.7%".
 */
export function formatViolationRate(confirmedViolations, totalTrips) {
  const trips = Math.max(0, Math.round(Number(totalTrips) || 0));
  const viol = Math.max(0, Math.round(Number(confirmedViolations) || 0));
  if (trips === 0) return '0.0%';
  const rate = (viol / trips) * 100;
  return `${rate.toFixed(1)}%`;
}

/**
 * Whether an amendment is currently effective (both signed + date reached + not applied yet is separate).
 */
export function isAmendmentEffective({ signedByA, signedByB, effectiveDate, now = new Date() }) {
  if (!signedByA || !signedByB) return false;
  const eff = new Date(effectiveDate).getTime();
  if (Number.isNaN(eff)) return false;
  return eff <= new Date(now).getTime();
}

/**
 * Deep-merge priceConfig delta into base config (vehicleType keys).
 * Only top-level vehicleType keys + nested rate keys are merged.
 */
export function mergePriceConfig(baseConfig, delta) {
  const base =
    typeof baseConfig === 'string'
      ? JSON.parse(baseConfig || '{}')
      : { ...(baseConfig || {}) };
  const patch =
    typeof delta === 'string' ? JSON.parse(delta || '{}') : { ...(delta || {}) };

  for (const [vehicleType, rates] of Object.entries(patch)) {
    if (!rates || typeof rates !== 'object') continue;
    base[vehicleType] = { ...(base[vehicleType] || {}), ...rates };
  }
  return base;
}

export default {
  evaluateTerminationRisk,
  formatViolationRate,
  isAmendmentEffective,
  mergePriceConfig,
};
