// B2B settlement VietQR builder.
//
// Corporate bank transfers are reconciled by encoding the settlement id in the
// transfer memo. The memo MUST round-trip: buildSettlementMemo() writes it into
// the QR, SePay echoes it back in the webhook `content`, and parseSettlementId()
// extracts the id to match the payment. Keep the prefix ASCII + uppercase so it
// survives bank content normalisation.
import env from '../config/env.js';

const MEMO_PREFIX = 'CarGoGo SETTLE';

/** Build the transfer memo for a settlement (e.g. "CarGoGo SETTLE 123"). */
export function buildSettlementMemo(settlementId) {
  return `${MEMO_PREFIX} ${Number(settlementId)}`;
}

/**
 * Extract a settlement id from an incoming transfer content string. Banks strip
 * punctuation/diacritics and may append their own reference, so match the digits
 * following the (space-insensitive) prefix rather than requiring an exact string.
 * @returns {number|null}
 */
export function parseSettlementId(content) {
  if (!content) return null;
  const normalized = String(content).toUpperCase().replace(/\s+/g, ' ');
  const match = normalized.match(/CarGoGo\s*SETTLE\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

/**
 * Build the VietQR payload for a settlement. The image is served by the public
 * img.vietqr.io renderer with amount + memo baked in, so the payer only scans.
 * @param {{ id: number, totalAmount: number }} settlement
 */
export function buildSettlementQr(settlement) {
  const amount = Math.round(Number(settlement.totalAmount || 0));
  const memo = buildSettlementMemo(settlement.id);
  const bin = env.SETTLEMENT_BANK_BIN;
  const account = env.SETTLEMENT_BANK_ACCOUNT;
  const accountName = env.SETTLEMENT_BANK_ACCOUNT_NAME;

  const qrImageUrl =
    `https://img.vietqr.io/image/${bin}-${account}-compact2.png` +
    `?amount=${amount}` +
    `&addInfo=${encodeURIComponent(memo)}` +
    `&accountName=${encodeURIComponent(accountName)}`;

  return {
    qrImageUrl,
    accountNumber: account,
    accountName,
    bank: env.SETTLEMENT_BANK_NAME,
    bankBin: bin,
    amount,
    memo,
  };
}

export default { buildSettlementQr, buildSettlementMemo, parseSettlementId };
