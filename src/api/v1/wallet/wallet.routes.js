// src/api/v1/wallet/wallet.routes.js
import { Router } from 'express';
import { walletController } from './wallet.controller.js';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { topupSchema, listTransactionsSchema } from './wallet.validator.js';

const router = Router();

// All wallet routes require authentication (mounted under /me/wallet).
router.use(authenticate);

// UC-44 — số dư + thông tin ví
router.get('/', asyncHandler(walletController.getWallet));

// UC-45 — lịch sử giao dịch (TOPUP/PAYMENT/REFUND/WITHDRAW)
router.get(
  '/transactions',
  validate(listTransactionsSchema, 'query'),
  asyncHandler(walletController.listTransactions)
);

// UC-46 (đầu) — nạp tiền vào ví
router.post('/topup', validate(topupSchema), asyncHandler(walletController.topup));

export default router;
