// tests/cars.api.test.js
import { jest } from '@jest/globals';
import request from 'supertest';

// We need to mock prisma before importing app
const mockVehicleFindMany = jest.fn();
const mockVehicleCount = jest.fn();
const mockVehicleFindUnique = jest.fn();
const mockBookingFindMany = jest.fn();
const mockBookingCount = jest.fn();

jest.unstable_mockModule('../src/config/prisma.js', () => ({
  default: {
    vehicle: {
      findMany: mockVehicleFindMany,
      count: mockVehicleCount,
      findUnique: mockVehicleFindUnique,
    },
    booking: {
      findMany: mockBookingFindMany,
      count: mockBookingCount,
    },
  },
}));

const { default: app } = await import('../src/app.js');

describe('Vehicle API - List / Filter / Sort', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVehicleFindMany.mockResolvedValue([]);
    mockVehicleCount.mockResolvedValue(0);
  });

  describe('GET /api/v1/cars', () => {
    it('should return 200 with paginated empty list', async () => {
      const res = await request(app).get('/api/v1/cars');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.total).toBe(0);
    });

    it('should accept page and limit params', async () => {
      const res = await request(app).get('/api/v1/cars?page=2&limit=5');

      expect(res.status).toBe(200);
      expect(res.body.meta.page).toBe(2);
      expect(res.body.meta.limit).toBe(5);
    });

    it('should filter by brandId', async () => {
      await request(app).get('/api/v1/cars?brandId=1');

      const callArgs = mockVehicleFindMany.mock.calls[0][0];
      expect(callArgs.where.brandId).toBe(1);
    });

    it('should filter by categoryId', async () => {
      await request(app).get('/api/v1/cars?categoryId=2');

      const callArgs = mockVehicleFindMany.mock.calls[0][0];
      expect(callArgs.where.categoryId).toBe(2);
    });

    it('should filter by stationId', async () => {
      await request(app).get('/api/v1/cars?stationId=3');

      const callArgs = mockVehicleFindMany.mock.calls[0][0];
      expect(callArgs.where.stationId).toBe(3);
    });

    it('should filter by seats', async () => {
      await request(app).get('/api/v1/cars?seats=7');

      const callArgs = mockVehicleFindMany.mock.calls[0][0];
      expect(callArgs.where.seats).toBe(7);
    });

    it('should filter by transmission', async () => {
      await request(app).get('/api/v1/cars?transmission=MANUAL');

      const callArgs = mockVehicleFindMany.mock.calls[0][0];
      expect(callArgs.where.transmission).toBe('MANUAL');
    });

    it('should filter by fuelType', async () => {
      await request(app).get('/api/v1/cars?fuelType=DIESEL');

      const callArgs = mockVehicleFindMany.mock.calls[0][0];
      expect(callArgs.where.fuelType).toBe('DIESEL');
    });

    it('should filter by price range (minPrice, maxPrice)', async () => {
      await request(app).get('/api/v1/cars?minPrice=3000000&maxPrice=10000000');

      const callArgs = mockVehicleFindMany.mock.calls[0][0];
      expect(callArgs.where.pricePerDay.gte).toBe(3000000);
      expect(callArgs.where.pricePerDay.lte).toBe(10000000);
    });

    it('should filter by isFeatured', async () => {
      await request(app).get('/api/v1/cars?isFeatured=true');

      const callArgs = mockVehicleFindMany.mock.calls[0][0];
      expect(callArgs.where.isFeatured).toBe(true);
    });

    it('should filter by featuredTag', async () => {
      await request(app).get('/api/v1/cars?featuredTag=XE_SANG');

      const callArgs = mockVehicleFindMany.mock.calls[0][0];
      expect(callArgs.where.featuredTag).toBe('XE_SANG');
    });

    it('should filter by search keyword', async () => {
      await request(app).get('/api/v1/cars?search=mercedes');

      const callArgs = mockVehicleFindMany.mock.calls[0][0];
      expect(callArgs.where.OR).toBeDefined();
      expect(callArgs.where.OR).toHaveLength(3);
      expect(callArgs.where.OR[0].name.contains).toBe('mercedes');
    });

    it('should sort by pricePerDay asc', async () => {
      await request(app).get('/api/v1/cars?sortBy=pricePerDay&sortOrder=asc');

      const callArgs = mockVehicleFindMany.mock.calls[0][0];
      expect(callArgs.orderBy).toEqual({ pricePerDay: 'asc' });
    });

    it('should sort by rating desc', async () => {
      await request(app).get('/api/v1/cars?sortBy=rating&sortOrder=desc');

      const callArgs = mockVehicleFindMany.mock.calls[0][0];
      expect(callArgs.orderBy).toEqual({ rating: 'desc' });
    });

    it('should default to sort by createdAt desc', async () => {
      await request(app).get('/api/v1/cars');

      const callArgs = mockVehicleFindMany.mock.calls[0][0];
      expect(callArgs.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('should reject invalid sortBy field and default to createdAt', async () => {
      await request(app).get('/api/v1/cars?sortBy=invalidField');

      const callArgs = mockVehicleFindMany.mock.calls[0][0];
      expect(callArgs.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('should combine multiple filters', async () => {
      await request(app).get(
        '/api/v1/cars?brandId=1&categoryId=2&seats=5&sortBy=pricePerDay&sortOrder=asc'
      );

      const callArgs = mockVehicleFindMany.mock.calls[0][0];
      expect(callArgs.where.brandId).toBe(1);
      expect(callArgs.where.categoryId).toBe(2);
      expect(callArgs.where.seats).toBe(5);
      expect(callArgs.orderBy).toEqual({ pricePerDay: 'asc' });
    });
  });

  describe('GET /api/v1/cars/:id', () => {
    it('should return 404 when vehicle not found', async () => {
      mockVehicleFindUnique.mockResolvedValue(null);

      const res = await request(app).get('/api/v1/cars/999');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return vehicle detail when found', async () => {
      mockVehicleFindUnique.mockResolvedValue({
        id: 1,
        name: 'BMW 320i',
        slug: 'bmw-320i-2024',
        brand: { id: 1, name: 'BMW' },
        model: { id: 1, name: '320i' },
        category: { id: 1, name: 'Sedan' },
        station: { id: 1, name: 'HQ' },
        images: [],
        reviews: [],
      });

      const res = await request(app).get('/api/v1/cars/1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('BMW 320i');
    });
  });

  describe('GET /api/v1/cars/:id/availability', () => {
    it('should return 400 when from/to missing', async () => {
      const res = await request(app).get('/api/v1/cars/1/availability');

      expect(res.status).toBe(400);
    });

    it('should return 400 when from >= to', async () => {
      const res = await request(app).get(
        '/api/v1/cars/1/availability?from=2024-07-10T00:00:00Z&to=2024-07-01T00:00:00Z'
      );

      expect(res.status).toBe(400);
    });

    it('should return 404 when vehicle not found', async () => {
      mockVehicleFindUnique.mockResolvedValue(null);

      const res = await request(app).get(
        '/api/v1/cars/999/availability?from=2024-07-01T00:00:00Z&to=2024-07-10T00:00:00Z'
      );

      expect(res.status).toBe(404);
    });

    it('should return availability data when vehicle exists', async () => {
      mockVehicleFindUnique.mockResolvedValue({ id: 1, name: 'Test Car' });
      mockBookingFindMany.mockResolvedValue([
        {
          id: 1,
          bookingCode: 'BK001',
          pickupAt: new Date('2024-07-05'),
          returnAt: new Date('2024-07-08'),
          status: 'CONFIRMED',
        },
      ]);

      const res = await request(app).get(
        '/api/v1/cars/1/availability?from=2024-07-01T00:00:00Z&to=2024-07-10T00:00:00Z'
      );

      expect(res.status).toBe(200);
      expect(res.body.data.vehicleId).toBe(1);
      expect(res.body.data.blockedRanges).toHaveLength(1);
      expect(res.body.data.isAvailable).toBe(false);
    });

    it('should return isAvailable=true when no blocked ranges', async () => {
      mockVehicleFindUnique.mockResolvedValue({ id: 1, name: 'Test Car' });
      mockBookingFindMany.mockResolvedValue([]);

      const res = await request(app).get(
        '/api/v1/cars/1/availability?from=2024-07-01T00:00:00Z&to=2024-07-10T00:00:00Z'
      );

      expect(res.status).toBe(200);
      expect(res.body.data.isAvailable).toBe(true);
      expect(res.body.data.blockedRanges).toHaveLength(0);
    });
  });
});
