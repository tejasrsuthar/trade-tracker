/**
 * Request ID Middleware
 * 
 * This middleware adds a unique request ID to each incoming request.
 * It either uses an existing request ID from the 'x-request-id' header
 * or generates a new UUID if one doesn't exist.
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware that adds a unique request ID to each request
 * 
 * This middleware:
 * 1. Checks for an existing request ID in the 'x-request-id' header
 * 2. If found, uses that ID; otherwise generates a new UUID
 * 3. Adds the ID to the request object for use in other middleware/controllers
 * 4. Sets the ID in the response headers for client tracking
 * 
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 * @returns {void} Calls next middleware in the chain
 */
export const addRequestId = (req: Request, res: Response, next: NextFunction) => {
  req.id = req.headers['x-request-id'] as string || uuidv4();
  res.setHeader('x-request-id', req.id);
  next();
};