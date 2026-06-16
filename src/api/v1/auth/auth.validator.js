// src/api/v1/auth/auth.validator.js
import { z } from 'zod';

const phoneRegex = /^(0|\+84)\d{9,10}$/;

export const registerSchema = z.object({
  fullName: z.string().min(2, 'fullName must be at least 2 chars').max(150),
  phone: z.string().regex(phoneRegex, 'Invalid VN phone number'),
  email: z.string().email().optional().or(z.literal('')),
  password: z
    .string()
    .min(8, 'Password must be at least 8 chars')
    .regex(/[A-Z]/, 'Password must contain uppercase')
    .regex(/[a-z]/, 'Password must contain lowercase')
    .regex(/\d/, 'Password must contain a number'),
});

export const loginSchema = z.object({
  identifier: z.string().min(3, 'identifier (phone/email) required'),
  password: z.string().min(1, 'password required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const verifyOtpSchema = z.object({
  identifier: z.string().min(3),
  code: z.string().min(4).max(8),
  purpose: z.enum(['REGISTER', 'RESET', 'CHANGE_PHONE']),
});
