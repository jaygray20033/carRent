// src/api/v1/wallet/wallet.controller.js
import { walletService } from './wallet.service.js';
import { success, created, paginated } from '../../../utils/apiResponse.js';

export const walletController = {
  // GET /me/wallet — UC-44
  getWallet: async (req, res) => {
    const wallet = await walletService.getWallet(req.user.id);
    return success(res, { wallet }, 'Wallet fetched');
  },

  // GET /me/wallet/transactions — UC-45
  listTransactions: async (req, res) => {
    const { type, page, limit } = req.query;
    const result = await walletService.listTransactions(req.user.id, { type, page, limit });
    return paginated(res, result.items, {
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  },

  // POST /me/wallet/topup — UC-46 (đầu)
  topup: async (req, res) => {
    const data = await walletService.topup(req.user.id, req.body);
    return created(res, data, 'Topup session created');
  },
};
