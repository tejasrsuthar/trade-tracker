import { z } from 'zod';
import { TradeType, TradeSize } from '../types';

/**
 * Schema for creating a new live trade
 * @property {string} accountId - Trading account identifier
 * @property {string} symbol - Trading symbol/ticker (non-empty)
 * @property {number} entryPrice - Entry price of the trade (positive number)
 * @property {TradeType} tradeType - Type of trade (enum: LONG/SHORT)
 * @property {TradeSize} size - Size category of the trade (enum)
 * @property {number} qty - Quantity of units traded (positive integer)
 * @property {number} slPercentage - Stop loss percentage (between 1 and 8)
 */
export const liveTradeSchema = z.object({
  accountId: z.string(),
  symbol: z.string().min(1),
  entryPrice: z.number().positive(),
  tradeType: z.nativeEnum(TradeType),
  size: z.nativeEnum(TradeSize),
  qty: z.number().int().positive(),
  slPercentage: z.number().min(1).max(8),
});

/**
 * Schema for updating an existing live trade
 * Allows partial updates of any live trade properties
 */
export const updateLiveTradeSchema = liveTradeSchema.partial();

/**
 * Schema for closing a trade
 * @property {number} exitPrice - Exit/closing price of the trade (positive number)
 * @property {number} [fees] - Optional trading fees (non-negative number)
 */
export const closeTradeSchema = z.object({
  exitPrice: z.number().positive(),
  fees: z.number().min(0).optional(),
});

/**
 * Type definition for creating a live trade
 */
export type LiveTradeInput = z.infer<typeof liveTradeSchema>;

/**
 * Type definition for updating a live trade
 */
export type UpdateLiveTradeInput = z.infer<typeof updateLiveTradeSchema>;

/**
 * Type definition for closing a trade
 */
export type CloseTradeInput = z.infer<typeof closeTradeSchema>;