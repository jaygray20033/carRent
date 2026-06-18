// src/api/v1/auth/auth.routes.js
import { Router } from 'express';
import { authController } from './auth.controller.js';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  verifyOtpSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.validator.js';

const router = Router();

// UC-01 / UC-02 / UC-03 — 4 core POST endpoints
router.post('/register', validate(registerSchema), asyncHandler(authController.register));
router.post('/login', validate(loginSchema), asyncHandler(authController.login));
router.post('/verify-otp', validate(verifyOtpSchema), asyncHandler(authController.verifyOtp));
router.post('/resend-otp', validate(resendOtpSchema), asyncHandler(authController.resendOtp));

// UC-04 — Forgot / Reset password
router.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  asyncHandler(authController.forgotPassword)
);
router.post(
  '/reset-password',
  validate(resetPasswordSchema),
  asyncHandler(authController.resetPassword)
);

// Token lifecycle
router.post('/refresh-token', validate(refreshSchema), asyncHandler(authController.refreshToken));
router.post('/logout', asyncHandler(authController.logout));

// Current user
router.get('/me', authenticate, asyncHandler(authController.me));

export default router;
