// src/controllers/auth.controller.js
import * as authService from '../services/auth.service.js';
import { success } from '../utils/response.js';

/**
 * POST /auth/register
 */
export async function register(req, res, next) {
  try {
    const user = await authService.register(req.body);
    return success(res, user, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/login
 */
export async function login(req, res, next) {
  try {
    const result = await authService.login(req.body);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /auth/me
 */
export async function getMe(req, res, next) {
  try {
    const profile = await authService.getProfile(req.user.userId);
    return success(res, profile);
  } catch (err) {
    next(err);
  }
}
