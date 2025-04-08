/**
 * Express router for managing trading operations.
 * @module routes/trades
 */
import express from 'express';
import {
  createLiveTrade,
  updateLiveTrade,
  deleteLiveTrade,
  closeLiveTrade,
  getLiveTradesHandler,
  getClosedTradesHandler,
} from '../controllers/trade.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = express.Router();

/**
 * Middleware to protect all trade routes
 * @middleware authenticateJWT - Validates JWT token for user authentication
 */
router.use(authenticateJWT);

/**
 * POST /api/trades/live
 * @description Create a new live trade
 * @route POST /live
 */
router.post('/live', createLiveTrade);

/**
 * PUT /api/trades/live/:id
 * @description Update an existing live trade
 * @route PUT /live/:id
 * @param {string} id - Trade ID
 */
router.put('/live/:id', updateLiveTrade);

/**
 * DELETE /api/trades/live/:id
 * @description Delete a live trade
 * @route DELETE /live/:id
 * @param {string} id - Trade ID
 */
router.delete('/live/:id', deleteLiveTrade);

/**
 * POST /api/trades/live/:id/close
 * @description Close a live trade
 * @route POST /live/:id/close
 * @param {string} id - Trade ID
 */
router.post('/live/:id/close', closeLiveTrade);

/**
 * GET /api/trades/live
 * @description Retrieve all live trades
 * @route GET /live
 */
router.get('/live', getLiveTradesHandler);

/**
 * GET /api/trades/closed
 * @description Retrieve all closed trades
 * @route GET /closed
 */
router.get('/closed', getClosedTradesHandler);

export default router;