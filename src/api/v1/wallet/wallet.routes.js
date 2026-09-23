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

/**
 * @swagger
 * /me/wallet:
 *   get:
 *     tags: [Wallet]
 *     summary: Get my wallet balance and info (UC-44)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Wallet balance }
 */
// UC-44 — số dư + thông tin ví
router.get('/', asyncHandler(walletController.getWallet));

/**
 * @swagger
 * /me/wallet/transactions:
 *   get:
 *     tags: [Wallet]
 *     summary: List wallet transactions (UC-45) — TOPUP/PAYMENT/REFUND/WITHDRAW
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: size
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Transaction history }
 */
// UC-45 — lịch sử giao dịch (TOPUP/PAYMENT/REFUND/WITHDRAW)
router.get(
  '/transactions',
  validate(listTransactionsSchema, 'query'),
  asyncHandler(walletController.listTransactions)
);

/**
 * @swagger
 * /me/wallet/topup:
 *   post:
 *     tags: [Wallet]
 *     summary: Top up the wallet (UC-46)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Top-up initiated }
 */
// UC-46 (đầu) — nạp tiền vào ví
router.post('/topup', validate(topupSchema), asyncHandler(walletController.topup));

export default router;
