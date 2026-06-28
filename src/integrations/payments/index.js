// src/integrations/payments/index.js — provider adapter registry.
import { vnpayAdapter } from './vnpay.adapter.js';
import { momoAdapter } from './momo.adapter.js';
import { zalopayAdapter } from './zalopay.adapter.js';
import { walletAdapter } from './wallet.adapter.js';
import { AppError } from '../../utils/apiError.js';

const ADAPTERS = {
  VNPAY: vnpayAdapter,
  MOMO: momoAdapter,
  ZALOPAY: zalopayAdapter,
  WALLET: walletAdapter,
};

/** Resolve a payment adapter by method, or throw 400 for unsupported methods. */
export function getAdapter(method) {
  const adapter = ADAPTERS[method];
  if (!adapter) {
    throw new AppError(`Unsupported payment method: ${method}`, 400, 'UNSUPPORTED_METHOD');
  }
  return adapter;
}

export { vnpayAdapter, momoAdapter, zalopayAdapter, walletAdapter };
