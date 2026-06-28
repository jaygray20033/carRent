// src/integrations/payments/wallet.adapter.js
// Internal wallet adapter — paying with the user's own wallet balance.
//
// Unlike external providers, there is no redirect: settlement is synchronous
// inside a DB transaction (balance check → deduct → mark Payment SUCCESS).
// Day 16: skeleton — the atomic deduction lands in Day 18 (UC-19).
import { AppError } from '../../utils/apiError.js';

export const walletAdapter = {
  provider: 'WALLET',

  // Wallet payments settle in-process; no external pay URL is produced.
  async createPayUrl() {
    return { payUrl: null, internal: true };
  },

  // No signed callbacks — wallet settlement is confirmed synchronously.
  verifyReturn() {
    throw new AppError('Wallet payments have no redirect callback', 400, 'NOT_APPLICABLE');
  },
  verifyIpn() {
    throw new AppError('Wallet payments have no IPN callback', 400, 'NOT_APPLICABLE');
  },
};

export default walletAdapter;
