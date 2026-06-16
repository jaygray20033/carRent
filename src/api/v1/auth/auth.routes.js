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
} from './auth.validator.js';

const router = Router();

router.post('/register', validate(registerSchema), asyncHandler(authController.register));
router.post('/login', validate(loginSchema), asyncHandler(authController.login));
router.post('/refresh-token', validate(refreshSchema), asyncHandler(authController.refreshToken));
router.post('/logout', asyncHandler(authController.logout));
router.post('/verify-otp', validate(verifyOtpSchema), asyncHandler(authController.verifyOtp));
router.get('/me', authenticate, asyncHandler(authController.me));

export default router;
