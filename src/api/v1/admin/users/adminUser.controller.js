// src/api/v1/admin/users/adminUser.controller.js
import { adminUserService } from './adminUser.service.js';
import { success, paginated } from '../../../../utils/apiResponse.js';

export const adminUserController = {
  // GET /admin/users — filterable list (UC-55).
  list: async (req, res) => {
    const result = await adminUserService.list(req.query);
    return paginated(res, result.items, {
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  },

  // GET /admin/users/:id — detail + booking history + wallet + reviews.
  detail: async (req, res) => {
    const data = await adminUserService.getById(req.params.id);
    return success(res, data, 'User detail');
  },

  // PATCH /admin/users/:id/status — ACTIVE | LOCKED (+ reason).
  updateStatus: async (req, res) => {
    const data = await adminUserService.updateStatus(req.user.id, req.params.id, {
      status: req.body.status,
      reason: req.body?.reason,
    });
    return success(res, data, 'User status updated');
  },

  // PATCH /admin/users/:id/role — change role (ADMIN only).
  updateRole: async (req, res) => {
    const user = await adminUserService.updateRole(req.user.id, req.params.id, req.body.role);
    return success(res, { user }, 'User role updated');
  },

  // POST /admin/users/:id/wallet/adjust — manual CREDIT | DEBIT.
  adjustWallet: async (req, res) => {
    const data = await adminUserService.adjustWallet(req.user.id, req.params.id, {
      amount: req.body.amount,
      type: req.body.type,
      note: req.body?.note,
    });
    return success(res, data, 'Wallet adjusted');
  },
};

export default adminUserController;
