// src/api/v1/me/addresses/address.controller.js
import { addressService } from './address.service.js';
import { success, created } from '../../../../utils/apiResponse.js';

export const addressController = {
  // GET /me/addresses — UC-42
  list: async (req, res) => {
    const addresses = await addressService.list(req.user.id);
    return success(res, { addresses }, 'Addresses fetched');
  },

  // POST /me/addresses — UC-42
  create: async (req, res) => {
    const address = await addressService.create(req.user.id, req.body);
    return created(res, { address }, 'Address created');
  },

  // PATCH /me/addresses/:id — UC-42
  update: async (req, res) => {
    const address = await addressService.update(req.user.id, req.params.id, req.body);
    return success(res, { address }, 'Address updated');
  },

  // PATCH /me/addresses/:id/default — UC-43
  setDefault: async (req, res) => {
    const address = await addressService.setDefault(req.user.id, req.params.id);
    return success(res, { address }, 'Default address set');
  },

  // DELETE /me/addresses/:id — UC-42
  remove: async (req, res) => {
    const result = await addressService.remove(req.user.id, req.params.id);
    return success(res, result, 'Address deleted');
  },
};
