// src/api/v1/auth/auth.validator.js
import { z } from 'zod';

// VN phone: 0xxxxxxxxx | +84xxxxxxxxx (9-10 digits after prefix)
const phoneRegex = /^(\+?84|0)\d{9,10}$/;

// identifier = email or phone
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const identifierSchema = z
  .string()
  .trim()
  .min(3, 'identifier (email|phone) required')
  .refine((v) => isEmail(v) || phoneRegex.test(v), {
    message: 'identifier must be a valid email or VN phone',
  });

export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'fullName must be 2-100 chars')
    .max(100, 'fullName must be 2-100 chars'),
  email: z
    .string()
    .trim()
    .email('Invalid email (RFC)')
    .max(160)
    .optional()
    .or(z.literal('')),
  phone: z.string().trim().regex(phoneRegex, 'Invalid VN phone number'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 chars')
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/\d/, 'Password must contain a number'),
});

export const loginSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1, 'password required'),
});

export const verifyOtpSchema = z.object({
  identifier: identifierSchema,
  code: z.string().regex(/^\d{6}$/, 'OTP code must be 6 digits'),
  purpose: z.enum(['REGISTER', 'RESET', 'CHANGE_PHONE']),
});

export const resendOtpSchema = z.object({
  identifier: identifierSchema,
  purpose: z.enum(['REGISTER', 'RESET', 'CHANGE_PHONE']),
});

// Kept for /refresh-token endpoint
export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

// UC-04 — Forgot password: only the identifier (email|phone).
export const forgotPasswordSchema = z.object({
  identifier: identifierSchema,
});

// UC-04 — Reset password: identifier + OTP code + new password.
export const resetPasswordSchema = z.object({
  identifier: identifierSchema,
  code: z.string().regex(/^\d{6}$/, 'OTP code must be 6 digits'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 chars')
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/\d/, 'Password must contain a number'),
});
