import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const addRequestId = (req: Request, res: Response, next: NextFunction) => {
  req.id = req.headers['x-request-id'] as string || uuidv4();
  res.setHeader('x-request-id', req.id);
  next();
};