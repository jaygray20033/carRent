// src/api/v1/users/user.controller.js
import { userService } from './user.service.js';
import storage from '../../../integrations/storage.js';
import { success } from '../../../utils/apiResponse.js';
import { ValidationError } from '../../../utils/apiError.js';

export const userController = {
  // UC-37 — current profile
  me: async (req, res) => {
    const user = await userService.getById(req.user.id);
    return success(res, { user }, 'OK');
  },

  // UC-38 — update profile
  updateMe: async (req, res) => {
    const user = await userService.updateProfile(req.user.id, req.body);
    return success(res, { user }, 'Profile updated');
  },

  // UC-39 — avatar upload (multipart field "image")
  uploadAvatar: async (req, res) => {
    if (!req.file) {
      throw new ValidationError([{ field: 'image', message: 'No image file uploaded' }]);
    }
    const { url } = await storage.upload(req.file, { folder: `avatars/${req.user.id}` });
    const user = await userService.setAvatar(req.user.id, url);
    return success(res, { user, avatarUrl: url, driver: storage.driver }, 'Avatar updated');
  },

  // UC-40 — change password
  changePassword: async (req, res) => {
    const data = await userService.changePassword(req.user.id, req.body);
    return success(res, data, 'Password changed');
  },

  // UC-41 — change phone step 1 (request OTP to new phone)
  requestPhoneChange: async (req, res) => {
    const data = await userService.requestPhoneChange(req.user.id, req.body);
    return success(res, data, 'OTP sent');
  },

  // UC-41 — change phone step 2 (verify OTP + apply)
  verifyPhoneChange: async (req, res) => {
    const data = await userService.verifyPhoneChange(req.user.id, req.body);
    return success(res, data, 'Phone changed');
  },
};
