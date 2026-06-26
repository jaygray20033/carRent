// src/controllers/stations.controller.js
import * as stationsService from '../services/stations.service.js';
import { success } from '../utils/response.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * GET /stations — List stations
 */
export async function listStations(req, res, next) {
  try {
    const data = await stationsService.listStations(req.query);
    return success(res, data);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /stations/:id — Station detail
 */
export async function getStation(req, res, next) {
  try {
    const station = await stationsService.getStationById(req.params.id);
    if (!station) throw new AppError(404, 'Station not found');
    return success(res, station);
  } catch (err) {
    next(err);
  }
}
