// src/api/v1/auth/auth.controller.js
import { authService } from './auth.service.js';
import { success, created } from '../../../utils/apiResponse.js';

export const authController = {
  register: async (req, res) => {
    const data = await authService.register(req.body);
    return created(res, data, 'Registered successfully');
  },

  login: async (req, res) => {
    const data = await authService.login(req.body);
    return success(res, data, 'Login successful');
  },

  refreshToken: async (req, res) => {
    const data = await authService.refreshToken(req.body);
    return success(res, data, 'Token refreshed');
  },

  logout: async (_req, res) => {
    // Stateless JWT — production: revoke refresh token in DB/Redis
    return success(res, {}, 'Logged out');
  },

  verifyOtp: async (req, res) => {
    const data = await authService.verifyOtp(req.body);
    return success(res, data, 'OTP verified');
  },

  me: async (req, res) => {
    return success(res, { user: req.user }, 'Current user');
  },
};
