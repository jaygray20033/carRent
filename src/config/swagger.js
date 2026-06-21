// src/config/swagger.js — OpenAPI 3.0 spec via swagger-jsdoc
import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env.js';

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'CarRent API',
      version: '1.0.0',
      description:
        'CarRent — Hệ thống cho thuê xe ô tô (Node.js + Express + Prisma + MySQL).\n\n' +
        'Tài liệu API tự sinh từ JSDoc annotations (`@swagger`).',
      contact: {
        name: 'CarRent Team',
        url: 'https://github.com/jaygray20033/carRent',
      },
      license: {
        name: 'MIT',
      },
    },
    servers: [
      {
        url: `${env.APP_URL}${env.API_PREFIX}`,
        description: `${env.NODE_ENV} server`,
      },
      {
        url: `http://localhost:${env.PORT}${env.API_PREFIX}`,
        description: 'Local server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Nhập access token: `Bearer <accessToken>`',
        },
      },
      schemas: {
        ApiSuccess: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'OK' },
            data: { type: 'object' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        ApiError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Invalid credentials' },
            code: { type: 'string', example: 'INVALID_CREDENTIALS', nullable: true },
            errors: { type: 'object', nullable: true },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '1' },
            fullName: { type: 'string', example: 'Nguyen Van A' },
            email: { type: 'string', nullable: true, example: 'a@example.com' },
            phone: { type: 'string', example: '0901234567' },
            status: {
              type: 'string',
              enum: ['ACTIVE', 'LOCKED', 'PENDING'],
              example: 'PENDING',
            },
            roleId: { type: 'integer', example: 1 },
          },
        },
      },
    },
    tags: [
      {
        name: 'Auth',
        description: 'Đăng ký, đăng nhập, xác thực OTP, quản lý token (UC-01..04)',
      },
    ],
    security: [{ bearerAuth: [] }],
  },
  // Quét JSDoc @swagger trong các file routes
  apis: ['./src/api/v1/**/*.routes.js'],
};

export const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
