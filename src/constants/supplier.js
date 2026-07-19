// Marketplace supplier constants.
// OtoRent acts as intermediary: Company books → Admin dispatches to a Supplier
// (white-label, hidden from the company) → Supplier assigns a driver → driver
// info is relayed back to the company only after an explicit release.

/** Default OtoRent commission rate when a supplier has none set. */
export const DEFAULT_COMMISSION_RATE = 0.15;

/**
 * Two confirmed CRITICAL violations trigger contract-termination risk
 * (HĐ CCDV Điều 3 — "vi phạm từ 02 lần trở lên → đơn phương chấm dứt").
 */
export const CRITICAL_VIOLATION_TERMINATION_THRESHOLD = 2;

/**
 * Fields on a CorporateBooking that must NEVER reach a corporate (company)
 * response — they reveal the white-label supplier relationship.
 */
export const SUPPLIER_ONLY_BOOKING_FIELDS = [
  'supplierId',
  'supplier',
  'supplierMemberId',
  'supplierMember',
  'dispatchedAt',
  'dispatchedBy',
  'commissionRate',
  'commissionAmount',
  'supplierVehicleNote',
  'driverInfoReleasedBy',
];

/**
 * Fields that reveal OtoRent's margin — must never reach the SUPPLIER either.
 * The supplier sees a plain fulfillment order, not what OtoRent earns on it.
 */
export const MARGIN_ONLY_BOOKING_FIELDS = [
  'commissionRate',
  'commissionAmount',
  'finalAmount',
  'basePrice',
];

/**
 * Strip white-label / margin fields before returning a booking to a CORPORATE
 * (company) caller. Also parses releasedDriverInfo JSON into `releasedDriverInfo`
 * only once it has been released; before release the company sees nothing.
 */
export function stripBookingForCorporate(booking) {
  if (!booking) return booking;
  const out = { ...booking };
  for (const f of SUPPLIER_ONLY_BOOKING_FIELDS) delete out[f];

  // Driver info is visible to the company only after an explicit release.
  if (out.driverInfoReleasedAt && booking.releasedDriverInfo) {
    try {
      out.releasedDriverInfo =
        typeof booking.releasedDriverInfo === 'string'
          ? JSON.parse(booking.releasedDriverInfo)
          : booking.releasedDriverInfo;
    } catch {
      out.releasedDriverInfo = null;
    }
  } else {
    delete out.releasedDriverInfo;
    delete out.driverInfoReleasedAt;
  }
  return out;
}

/**
 * Strip margin + the corporate client's identity before returning a booking to
 * a SUPPLIER caller. The supplier fulfils an anonymous OtoRent order.
 */
export function stripBookingForSupplier(booking) {
  if (!booking) return booking;
  const out = { ...booking };
  for (const f of MARGIN_ONLY_BOOKING_FIELDS) delete out[f];
  delete out.corporate;
  delete out.corporateId;
  delete out.employee;
  delete out.employeeId;
  delete out.rejectReason;
  return out;
}

export default {
  DEFAULT_COMMISSION_RATE,
  CRITICAL_VIOLATION_TERMINATION_THRESHOLD,
  SUPPLIER_ONLY_BOOKING_FIELDS,
  MARGIN_ONLY_BOOKING_FIELDS,
  stripBookingForCorporate,
  stripBookingForSupplier,
};
