// src/docs/schemas.js
/**
 * @swagger
 * components:
 *   schemas:
 *     Vehicle:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         name: { type: string }
 *         slug: { type: string }
 *         modelYear: { type: integer }
 *         licensePlate: { type: string }
 *         color: { type: string }
 *         seats: { type: integer }
 *         transmission: { type: string, enum: [AUTO, MANUAL] }
 *         fuelType: { type: string, enum: [GASOLINE, DIESEL, ELECTRIC, HYBRID] }
 *         pricePerDay: { type: number }
 *         pricePerMonth: { type: number }
 *         depositAmount: { type: number }
 *         description: { type: string }
 *         thumbnailUrl: { type: string }
 *         status: { type: string, enum: [AVAILABLE, MAINTENANCE, RENTED] }
 *         rating: { type: number }
 *         reviewCount: { type: integer }
 *         totalBookings: { type: integer }
 *         isFeatured: { type: boolean }
 *         featuredTag: { type: string, enum: [XE_DOI_MOI, XE_SANG, DAT_HANG] }
 *         brand:
 *           $ref: '#/components/schemas/Brand'
 *         model:
 *           $ref: '#/components/schemas/VehicleModel'
 *         category:
 *           $ref: '#/components/schemas/Category'
 *         station:
 *           $ref: '#/components/schemas/Station'
 *
 *     Brand:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         name: { type: string }
 *         slug: { type: string }
 *         logoUrl: { type: string }
 *         country: { type: string }
 *
 *     VehicleModel:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         name: { type: string }
 *         slug: { type: string }
 *         seats: { type: integer }
 *         transmission: { type: string }
 *         fuelType: { type: string }
 *
 *     Category:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         name: { type: string }
 *         slug: { type: string }
 *         icon: { type: string }
 *
 *     Station:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         name: { type: string }
 *         type: { type: string, enum: [AIRPORT, CITY, HQ] }
 *         city: { type: string }
 *         district: { type: string }
 *         address: { type: string }
 *         latitude: { type: number }
 *         longitude: { type: number }
 *         phone: { type: string }
 *         isActive: { type: boolean }
 *
 *     Booking:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         bookingCode: { type: string }
 *         userId: { type: integer }
 *         vehicleId: { type: integer }
 *         rentalType: { type: string, enum: [SELF_DRIVE, WITH_DRIVER] }
 *         pickupAt: { type: string, format: date-time }
 *         returnAt: { type: string, format: date-time }
 *         totalDays: { type: integer }
 *         pricePerDay: { type: number }
 *         totalAmount: { type: number }
 *         status: { type: string, enum: [PENDING_PAYMENT, CONFIRMED, IN_USE, COMPLETED, CANCELLED, REFUNDED, DRAFT] }
 *
 *     PaginatedResponse:
 *       type: object
 *       properties:
 *         success: { type: boolean }
 *         data: { type: array }
 *         meta:
 *           type: object
 *           properties:
 *             page: { type: integer }
 *             limit: { type: integer }
 *             total: { type: integer }
 *             totalPages: { type: integer }
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success: { type: boolean, example: false }
 *         message: { type: string }
 *         details: { type: array }
 */
