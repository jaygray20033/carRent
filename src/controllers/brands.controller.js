// src/controllers/brands.controller.js
import * as brandsService from '../services/brands.service.js';
import { success } from '../utils/response.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * GET /brands — List all brands
 */
export async function listBrands(req, res, next) {
  try {
    const data = await brandsService.listBrands();
    return success(res, data);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /brands/:id — Brand detail with models
 */
export async function getBrand(req, res, next) {
  try {
    const brand = await brandsService.getBrandById(req.params.id);
    if (!brand) throw new AppError(404, 'Brand not found');
    return success(res, brand);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /categories — List all categories
 */
export async function listCategories(req, res, next) {
  try {
    const data = await brandsService.listCategories();
    return success(res, data);
  } catch (err) {
    next(err);
  }
}
