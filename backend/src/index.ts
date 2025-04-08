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
import './middleware/auth.middleware';

/**
 * Express application instance
 */
const app = express();

// Configure middleware
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

// Register routes
app.use('/api/trades', tradeRoutes);
app.use('/api/auth', authRoutes);

/**
 * Initializes and starts the server
 * Sets up telemetry and Kafka producer before starting Express
 */
const startServer = async () => {
  initTelemetry();
  await connectProducer();
  app.listen(6000, () => console.log('Backend running on port 6000'));
};

startServer();