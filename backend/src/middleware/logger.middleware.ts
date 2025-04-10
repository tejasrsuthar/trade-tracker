/**
 * Logger Middleware
 * 
 * This middleware logs incoming HTTP requests and their completion status.
 * It captures request details like method, URL, query parameters, and IP address,
 * and logs the response status code when the request completes.
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';

/**
 * Middleware that logs HTTP request details and completion status
 * 
 * This middleware performs two main logging operations:
 * 1. Logs details of the incoming request (method, URL, query params, etc.)
 * 2. Sets up a listener to log the response status when the request completes
 * 
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 * @returns {void} Calls next middleware in the chain
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  logger.info({
    method: req.method,
    url: req.url,
    query: req.query,
    params: req.params,
    ip: req.ip,
  }, 'Incoming request');

  res.on('finish', () => {
    logger.info({
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      ip: req.ip,
    }, 'Request completed');
  });

  next();
};