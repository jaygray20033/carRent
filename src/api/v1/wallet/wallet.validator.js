// src/api/v1/wallet/wallet.validator.js
import { z } from 'zod';

export const MIN_TOPUP = 50_000; // 50,000 VND
export const MAX_TOPUP = 50_000_000; // 50,000,000 VND

export const TOPUP_METHODS = ['VNPAY', 'MOMO', 'ZALOPAY', 'BANK_TRANSFER'];
export const TX_TYPES = ['TOPUP', 'PAYMENT', 'REFUND', 'WITHDRAW'];

// POST /me/wallet/topup
export const topupSchema = z.object({
  amount: z
    .number({ invalid_type_error: 'amount must be a number' })
    .int('amount must be an integer (VND)')
    .min(MIN_TOPUP, `Số tiền nạp tối thiểu là ${MIN_TOPUP.toLocaleString('vi-VN')} VND`)
    .max(MAX_TOPUP, `Số tiền nạp tối đa là ${MAX_TOPUP.toLocaleString('vi-VN')} VND`),
  method: z.enum(TOPUP_METHODS, {
    errorMap: () => ({ message: `method must be one of: ${TOPUP_METHODS.join(', ')}` }),
  }),
});

// GET /me/wallet/transactions?type=&page=&limit=
export const listTransactionsSchema = z.object({
  type: z.enum(TX_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
