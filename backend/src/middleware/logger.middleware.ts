import { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';

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