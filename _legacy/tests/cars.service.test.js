// tests/cars.service.test.js
import { jest } from '@jest/globals';

// Mock prisma
const mockBookingFindMany = jest.fn();
const mockBookingCount = jest.fn();
const mockVehicleFindMany = jest.fn();
const mockVehicleCount = jest.fn();
const mockVehicleFindUnique = jest.fn();

jest.unstable_mockModule('../src/config/prisma.js', () => ({
  default: {
    booking: {
      findMany: mockBookingFindMany,
      count: mockBookingCount,
    },
    vehicle: {
      findMany: mockVehicleFindMany,
      count: mockVehicleCount,
      findUnique: mockVehicleFindUnique,
    },
  },
}));

const { getVehicleAvailability, hasOverlap } = await import('../src/services/cars.service.js');

describe('Cars Service - Overlap Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getVehicleAvailability', () => {
    it('should return empty array when no bookings overlap', async () => {
      mockBookingFindMany.mockResolvedValue([]);

      const result = await getVehicleAvailability(1, '2024-07-01', '2024-07-10');

      expect(result).toEqual([]);
      expect(mockBookingFindMany).toHaveBeenCalledTimes(1);
    });

    it('should return bookings that overlap with requested range', async () => {
      const mockBookings = [
        {
          id: 1,
          bookingCode: 'BK001',
          pickupAt: new Date('2024-07-05'),
          returnAt: new Date('2024-07-08'),
          status: 'CONFIRMED',
        },
      ];
      mockBookingFindMany.mockResolvedValue(mockBookings);

      const result = await getVehicleAvailability(1, '2024-07-01', '2024-07-10');

      expect(result).toHaveLength(1);
      expect(result[0].bookingCode).toBe('BK001');
    });

    it('should filter out CANCELLED, REFUNDED, COMPLETED statuses', async () => {
      mockBookingFindMany.mockResolvedValue([]);

      await getVehicleAvailability(1, '2024-07-01', '2024-07-10');

      const callArgs = mockBookingFindMany.mock.calls[0][0];
      expect(callArgs.where.status.notIn).toContain('CANCELLED');
      expect(callArgs.where.status.notIn).toContain('REFUNDED');
      expect(callArgs.where.status.notIn).toContain('COMPLETED');
    });

    it('should use correct overlap condition: returnAt > from AND pickupAt < to', async () => {
      mockBookingFindMany.mockResolvedValue([]);

      const from = '2024-07-01T00:00:00Z';
      const to = '2024-07-10T00:00:00Z';
      await getVehicleAvailability(1, from, to);

      const callArgs = mockBookingFindMany.mock.calls[0][0];
      // returnAt > from
      expect(callArgs.where.AND[0].returnAt.gt).toEqual(new Date(from));
      // pickupAt < to
      expect(callArgs.where.AND[1].pickupAt.lt).toEqual(new Date(to));
    });
  });

  describe('hasOverlap', () => {
    it('should return false when no overlap exists', async () => {
      mockBookingCount.mockResolvedValue(0);

      const result = await hasOverlap(1, '2024-07-01', '2024-07-10');

      expect(result).toBe(false);
    });

    it('should return true when overlap exists', async () => {
      mockBookingCount.mockResolvedValue(1);

      const result = await hasOverlap(1, '2024-07-01', '2024-07-10');

      expect(result).toBe(true);
    });

    it('should exclude specific booking when excludeBookingId provided', async () => {
      mockBookingCount.mockResolvedValue(0);

      await hasOverlap(1, '2024-07-01', '2024-07-10', 5);

      const callArgs = mockBookingCount.mock.calls[0][0];
      expect(callArgs.where.id).toEqual({ not: 5 });
    });

    it('should not add id filter when excludeBookingId is null', async () => {
      mockBookingCount.mockResolvedValue(0);

      await hasOverlap(1, '2024-07-01', '2024-07-10', null);

      const callArgs = mockBookingCount.mock.calls[0][0];
      expect(callArgs.where.id).toBeUndefined();
    });

    // Edge case: booking ends exactly when requested range starts → no overlap
    it('should not overlap when booking returnAt equals range start (boundary)', async () => {
      // If returnAt = from, condition is returnAt > from → false, so no overlap
      mockBookingCount.mockResolvedValue(0);

      const result = await hasOverlap(1, '2024-07-05T10:00:00Z', '2024-07-10T10:00:00Z');

      expect(result).toBe(false);
      const callArgs = mockBookingCount.mock.calls[0][0];
      // Ensures gt (not gte) is used
      expect(callArgs.where.AND[0].returnAt.gt).toEqual(new Date('2024-07-05T10:00:00Z'));
    });

    // Edge case: booking starts exactly when requested range ends → no overlap
    it('should not overlap when booking pickupAt equals range end (boundary)', async () => {
      // If pickupAt = to, condition is pickupAt < to → false, so no overlap
      mockBookingCount.mockResolvedValue(0);

      const result = await hasOverlap(1, '2024-07-01T10:00:00Z', '2024-07-05T10:00:00Z');

      expect(result).toBe(false);
      const callArgs = mockBookingCount.mock.calls[0][0];
      // Ensures lt (not lte) is used
      expect(callArgs.where.AND[1].pickupAt.lt).toEqual(new Date('2024-07-05T10:00:00Z'));
    });
  });
});
