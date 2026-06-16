// src/api/v1/payments/payment.validator.js
import { z } from 'zod';

export const checkoutSchema = z.object({
  bookingId: z.union([z.string(), z.number()]).transform((v) => v.toString()),
  method: z.enum(['VNPAY', 'MOMO', 'ZALOPAY', 'WALLET', 'BANK_TRANSFER', 'CASH']),
});
