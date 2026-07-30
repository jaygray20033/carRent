// src/api/v1/auth/auth.routes.js
import { Router } from 'express';
import { authController } from './auth.controller.js';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { rateLimit } from '../../../middlewares/rateLimit.middleware.js';
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

// ── Rate limiters (Day 41 §8, Redis-backed, per-IP) ──────────────────────
// Blanket limiter for the whole auth surface: 10 req/min/IP.
const authLimiter = rateLimit({
  max: 10,
  windowSec: 60,
  keyPrefix: 'auth',
  message: 'Quá nhiều yêu cầu xác thực. Vui lòng thử lại sau ít phút.',
});
// Brute-force guard on login: 5 req/15m/IP.
const loginLimiter = rateLimit({
  max: 5,
  windowSec: 900,
  keyPrefix: 'auth:login',
  message: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút.',
});
// Password-reset abuse guard: 3 req/h/IP.
const forgotLimiter = rateLimit({
  max: 3,
  windowSec: 3600,
  keyPrefix: 'auth:forgot',
  message: 'Bạn đã yêu cầu đặt lại mật khẩu quá nhiều lần. Vui lòng thử lại sau một giờ.',
});

router.use(authLimiter);

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Đăng ký tài khoản (UC-01)
 *     description: >
 *       Tạo user ở trạng thái `PENDING` kèm ví (wallet) và gửi OTP qua SMS để
 *       kích hoạt. Email là tuỳ chọn, số điện thoại bắt buộc (định dạng VN).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, phone, password]
 *             properties:
 *               fullName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 example: Nguyen Van A
 *               phone:
 *                 type: string
 *                 description: Số điện thoại VN (0xxxxxxxxx hoặc +84xxxxxxxxx)
 *                 example: '0901234567'
 *               email:
 *                 type: string
 *                 format: email
 *                 nullable: true
 *                 example: a@example.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: Tối thiểu 8 ký tự, gồm chữ và số
 *                 example: Password123
 *     responses:
 *       201:
 *         description: Đăng ký thành công, OTP đã được gửi
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         user: { $ref: '#/components/schemas/User' }
 *                         requireOtp: { type: boolean, example: true }
 *                         otpPurpose: { type: string, example: REGISTER }
 *       409:
 *         description: Số điện thoại hoặc email đã tồn tại
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       422:
 *         description: Dữ liệu không hợp lệ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 */
router.post('/register', validate(registerSchema), asyncHandler(authController.register));

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Đăng nhập (UC-02)
 *     description: >
 *       Đăng nhập bằng email hoặc số điện thoại + mật khẩu. Trả về `accessToken`
 *       và `refreshToken`. Sai mật khẩu 5 lần liên tiếp sẽ khoá 15 phút.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier, password]
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: Email hoặc số điện thoại
 *                 example: '0901234567'
 *               password:
 *                 type: string
 *                 example: Password123
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         user: { $ref: '#/components/schemas/User' }
 *                         accessToken:
 *                           type: string
 *                           example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
 *                         refreshToken:
 *                           type: string
 *                           example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
 *       401:
 *         description: Sai thông tin đăng nhập
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       403:
 *         description: Tài khoản bị khoá hoặc chưa xác thực OTP
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 */
router.post('/login', loginLimiter, validate(loginSchema), asyncHandler(authController.login));

/**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Xác thực OTP (UC-03)
 *     description: >
 *       Xác thực mã OTP 6 chữ số theo mục đích (`REGISTER` / `RESET` /
 *       `CHANGE_PHONE`). Nhập sai 5 lần sẽ khoá 30 phút.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier, code, purpose]
 *             properties:
 *               identifier:
 *                 type: string
 *                 example: '0901234567'
 *               code:
 *                 type: string
 *                 pattern: '^\d{6}$'
 *                 example: '048213'
 *               purpose:
 *                 type: string
 *                 enum: [REGISTER, RESET, CHANGE_PHONE]
 *                 example: REGISTER
 *     responses:
 *       200:
 *         description: OTP hợp lệ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       403:
 *         description: Bị khoá do nhập sai OTP quá nhiều lần
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       410:
 *         description: OTP đã hết hạn hoặc không tồn tại
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       422:
 *         description: Mã OTP không đúng
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 */
router.post('/verify-otp', validate(verifyOtpSchema), asyncHandler(authController.verifyOtp));

/**
 * @swagger
 * /auth/resend-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Gửi lại OTP (UC-03)
 *     description: >
 *       Gửi lại mã OTP theo mục đích. Có cooldown 60 giây giữa 2 lần gửi.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier, purpose]
 *             properties:
 *               identifier:
 *                 type: string
 *                 example: '0901234567'
 *               purpose:
 *                 type: string
 *                 enum: [REGISTER, RESET, CHANGE_PHONE]
 *                 example: REGISTER
 *     responses:
 *       200:
 *         description: Đã gửi lại OTP
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       429:
 *         description: Gửi quá nhanh (đang trong thời gian cooldown)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 */
router.post('/resend-otp', validate(resendOtpSchema), asyncHandler(authController.resendOtp));

// UC-04 — Forgot / Reset password
router.post(
  '/forgot-password',
  forgotLimiter,
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
