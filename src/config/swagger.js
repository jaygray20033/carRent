// src/config/swagger.js
import swaggerJSDoc from 'swagger-jsdoc';
import env from './env.js';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'OtoRent API',
      version: '1.0.0',
      description: 'Hệ thống cho thuê xe ô tô - API Documentation',
      contact: { name: 'OtoRent Team', email: 'contact@otorent.vn' },
    },
    servers: [{ url: `${env.APP_URL}${env.API_PREFIX}`, description: 'Development' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/api/v1/**/*.routes.js'],
};

const swaggerSpec = swaggerJSDoc(options);
export default swaggerSpec;
