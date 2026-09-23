// src/controllers/cars.controller.js
import * as carsService from '../services/cars.service.js';
import { success, paginated } from '../utils/response.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * GET /cars — List vehicles with filters
 */
export async function listVehicles(req, res, next) {
  try {
    const { data, total, page, limit } = await carsService.listVehicles(req.query);
    return paginated(res, data, { page, limit, total });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /cars/:id — Vehicle detail
 */
export async function getVehicle(req, res, next) {
  try {
    const vehicle = await carsService.getVehicleById(req.params.id);
    if (!vehicle) throw new AppError(404, 'Vehicle not found');
    return success(res, vehicle);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /cars/:id/availability?from=&to=
 * Returns array of booked ranges (status in CONFIRMED, IN_USE, PENDING_PAYMENT, DRAFT not expired)
 */
export async function getAvailability(req, res, next) {
  try {
    const { id } = req.params;
    const { from, to } = req.query;

    if (!from || !to) {
      throw new AppError(400, 'Query params "from" and "to" are required (ISO 8601)');
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new AppError(400, 'Invalid date format. Use ISO 8601 (e.g. 2024-01-15T00:00:00Z)');
    }

    if (fromDate >= toDate) {
      throw new AppError(400, '"from" must be before "to"');
    }

    // Verify vehicle exists
    const vehicle = await carsService.getVehicleById(id);
    if (!vehicle) throw new AppError(404, 'Vehicle not found');

    const blockedRanges = await carsService.getVehicleAvailability(id, from, to);

    return success(res, {
      vehicleId: Number(id),
      queryRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      blockedRanges,
      isAvailable: blockedRanges.length === 0,
    });
  } catch (err) {
    next(err);
  }
}
