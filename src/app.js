// src/app.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import env from './config/env.js';
import swaggerSpec from './config/swagger.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

const app = express();

// Security & Performance
app.use(helmet());
app.use(compression());
app.use(cors({ origin: env.corsOrigin, credentials: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  message: { success: false, message: 'Too many requests, please try again later' },
});
app.use(limiter);

// Logging
if (env.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Swagger docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

// API routes
app.use(env.apiPrefix, routes);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'OtoRent API',
    version: '1.0.0',
    docs: `${env.appUrl}/api-docs`,
    health: `${env.appUrl}${env.apiPrefix}/health`,
  });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
