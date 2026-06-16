// src/api/v1/users/user.validator.js
import { z } from 'zod';

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).max(150).optional(),
  email: z.string().email().optional(),
  avatarUrl: z.string().url().optional(),
  dateOfBirth: z.string().datetime().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  nationalId: z.string().max(50).optional(),
  driverLicense: z.string().max(50).optional(),
});
