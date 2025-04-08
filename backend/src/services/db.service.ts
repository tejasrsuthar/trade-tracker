/**
 * Database service module for trade management
 * Provides CRUD operations for live and closed trades using Prisma ORM
 * @module services/db
 */
import { PrismaClient } from '@prisma/client';
import { LiveTrade, ClosedTrade } from '../types';
import retry from 'async-retry';

/**
 * Prisma client instance for database operations
 * Handles all database connections and queries
 */
const prisma = new PrismaClient();

/**
 * Creates a new live trade in the database
 * 
 * @param trade - The live trade object to be created
 * @returns The created live trade record
 */
export const createLiveTrade = async (trade: LiveTrade) => {
  return retry(
    async () => {
      return prisma.liveTrade.create({
        data: {
          id: trade.id,
          accountId: trade.accountId,
          symbol: trade.symbol,
          entryPrice: trade.entryPrice,
          tradeType: trade.tradeType,
          size: trade.size,
          qty: trade.qty,
          slPercentage: trade.slPercentage,
          entryDate: trade.entryDate,
        },
      });
    },
    { retries: 3, minTimeout: 500, factor: 2, onRetry: (err: Error) => console.warn('Retrying createLiveTrade:', err.message) }
  );
};

/**
 * Updates an existing live trade in the database
 * 
 * @param id - The unique identifier of the trade to update
 * @param trade - Partial trade object containing fields to update
 * @returns The updated live trade record
 */
export const updateLiveTrade = async (id: string, trade: Partial<LiveTrade>) => {
  return retry(
    async () => {
      return prisma.liveTrade.update({
        where: { id },
        data: {
          symbol: trade.symbol,
          entryPrice: trade.entryPrice,
          tradeType: trade.tradeType,
          size: trade.size,
          qty: trade.qty,
          slPercentage: trade.slPercentage,
        },
      });
    },
    { retries: 3, minTimeout: 500, factor: 2, onRetry: (err: Error) => console.warn('Retrying updateLiveTrade:', err.message) }
  );
};

/**
 * Deletes a live trade from the database
 * 
 * @param id - The unique identifier of the trade to delete
 * @returns The deleted live trade record
 */
export const deleteLiveTrade = async (id: string) => {
  return retry(
    async () => {
      return prisma.liveTrade.delete({ where: { id } });
    },
    { retries: 3, minTimeout: 500, factor: 2, onRetry: (err: Error) => console.warn('Retrying deleteLiveTrade:', err.message) }
  );
};

/**
 * Closes a live trade by moving it to closed trades with exit information
 * 
 * @param id - The unique identifier of the live trade to close
 * @param exitPrice - The price at which the trade was closed
 * @param fees - Optional transaction fees associated with closing the trade
 * @returns The newly created closed trade record
 */
export const closeLiveTrade = async (id: string, exitPrice: number, fees?: number) => {
  return retry(
    async () => {
      const liveTrade = await prisma.liveTrade.delete({ where: { id } });
      return prisma.closedTrade.create({
        data: {
          id,
          accountId: liveTrade.accountId,
          symbol: liveTrade.symbol,
          entryPrice: liveTrade.entryPrice,
          exitPrice,
          tradeType: liveTrade.tradeType,
          size: liveTrade.size,
          qty: liveTrade.qty,
          entryDate: liveTrade.entryDate,
          fees,
          realizedPL: (exitPrice - liveTrade.entryPrice) * liveTrade.qty - (fees || 0),
        },
      });
    },
    { retries: 3, minTimeout: 500, factor: 2, onRetry: (err: Error) => console.warn('Retrying closeLiveTrade:', err.message) }
  );
};

/**
 * Retrieves all live trades for a specific account
 * 
 * @param accountId - The unique identifier of the account
 * @returns An array of live trade records
 */
export const getLiveTrades = async (accountId: string) => {
  return retry(
    async () => {
      return prisma.liveTrade.findMany({ where: { accountId } });
    },
    { retries: 3, minTimeout: 500, factor: 2, onRetry: (err: Error) => console.warn('Retrying getLiveTrades:', err.message) }
  );
};

/**
 * Retrieves all closed trades for a specific account
 * 
 * @param accountId - The unique identifier of the account
 * @returns An array of closed trade records
 */
export const getClosedTrades = async (accountId: string) => {
  return retry(
    async () => {
      return prisma.closedTrade.findMany({ where: { accountId } });
    },
    { retries: 3, minTimeout: 500, factor: 2, onRetry: (err: Error) => console.warn('Retrying getClosedTrades:', err.message) }
  );
};
