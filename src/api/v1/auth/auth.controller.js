// src/api/v1/auth/auth.controller.js
import { authService } from './auth.service.js';
import { success, created } from '../../../utils/apiResponse.js';

const reqMeta = (req) => ({
  ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
  deviceInfo: req.headers['user-agent'] || null,
});

export const authController = {
  // UC-01
  register: async (req, res) => {
    const data = await authService.register(req.body);
    return created(res, data, 'Registered successfully. OTP sent.');
  },

  // UC-02
  login: async (req, res) => {
    const data = await authService.login(req.body, reqMeta(req));
    return success(res, data, 'Login successful');
  },

  // UC-03
  verifyOtp: async (req, res) => {
    const data = await authService.verifyOtp(req.body);
    return success(res, data, 'OTP verified');
  },

  resendOtp: async (req, res) => {
    const data = await authService.resendOtp(req.body);
    return success(res, data, 'OTP resent');
  },

  refreshToken: async (req, res) => {
    const data = await authService.refreshToken(req.body, reqMeta(req));
    return success(res, data, 'Token refreshed');
  },

  logout: async (req, res) => {
    const data = await authService.logout(req.body || {});
    return success(res, data, 'Logged out');
  },

  me: async (req, res) => {
    return success(res, { user: req.user }, 'Current user');
  },
};

export default authController;
