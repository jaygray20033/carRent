// src/api/v1/users/user.controller.js
import { userService } from './user.service.js';
import { success } from '../../../utils/apiResponse.js';

export const userController = {
  me: async (req, res) => {
    const user = await userService.getById(req.user.id);
    return success(res, { user }, 'OK');
  },

  updateMe: async (req, res) => {
    const user = await userService.updateProfile(req.user.id, req.body);
    return success(res, { user }, 'Profile updated');
  },
};
