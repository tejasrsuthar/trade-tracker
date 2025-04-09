/**
 * Main application entry point
 * Initializes Express server with middleware, routes, and services
 * @module index
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import dotenv from 'dotenv';
dotenv.config();

import tradeRoutes from './routes/trades.route';
import authRoutes from './routes/auth.route';
import { connectProducer } from './services/kafka.producer';
import { initTelemetry } from './services/telemetry.service';
import { setupSwagger } from './swagger/swaggerServe';
import logger from './lib/logger';
import { requestLogger } from './middleware/logger.middleware';
import { addRequestId } from './middleware/requestId.middleware';
import './middleware/auth.middleware';

/**
 * Express application instance
 */
const app = express();

// Configure middleware
app.use(addRequestId);
app.use(requestLogger);
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

// Register routes
app.use('/api/trades', tradeRoutes);
app.use('/api/auth', authRoutes);

// setup swagger UI
setupSwagger(app);

const PORT = process.env.PORT || 6000;
/**
 * Initializes and starts the server
 * Sets up telemetry and Kafka producer before starting Express
 */
const startServer = async () => {
  initTelemetry();
  await connectProducer();
  app.listen(PORT, () => {
    logger.info(`Server is running on http://localhost:${PORT}`);
    logger.info(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
  });

  process.on('uncaughtException', (error) => {
    logger.fatal(error, 'Uncaught Exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.fatal({ reason, promise }, 'Unhandled Rejection');
    process.exit(1);
  });
};

startServer();