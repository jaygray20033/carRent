// src/api/v1/users/user.validator.js
import { z } from 'zod';

// VN phone: 0xxxxxxxxx | +84xxxxxxxxx (9-10 digits after prefix)
const phoneRegex = /^(\+?84|0)\d{9,10}$/;

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 chars')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).max(150).optional(),
  email: z.string().email().optional(),
  avatarUrl: z.string().url().optional(),
  dateOfBirth: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Invalid date')
    .optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  nationalId: z.string().max(50).optional(),
  driverLicense: z.string().max(50).optional(),
});

// UC-40 — change password
export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'oldPassword required'),
  newPassword: passwordSchema,
});

// UC-41 — change phone step 1 (request OTP to the new phone)
export const requestPhoneChangeSchema = z.object({
  newPhone: z.string().trim().regex(phoneRegex, 'Invalid VN phone number'),
});

// UC-41 — change phone step 2 (verify OTP)
export const verifyPhoneChangeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'OTP code must be 6 digits'),
});
