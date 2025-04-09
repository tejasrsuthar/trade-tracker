import { Request, Response } from 'express';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { StatusCodes } from 'http-status-codes';

import { sendMessage } from '../services/kafka.producer';
import { LiveTrade } from '../types';
import { liveTradeSchema, updateLiveTradeSchema, closeTradeSchema } from '../schemas/trade.schema';
import { getLiveTrades, getClosedTrades } from '../services/db.service';

const tracer = trace.getTracer('trade-backend');

/**
 * Creates a new live trade.
 * 
 * This function parses the request body using the live trade schema, generates a new trade ID, and sends a 'TradeCreated' event to the trade-events topic.
 * 
 * @param {Request} req - The incoming request object.
 * @param {Response} res - The outgoing response object.
 * @returns {Promise<void>} A promise that resolves when the function completes.
 */
export const createLiveTrade = async (req: Request, res: Response) => {
  return tracer.startActiveSpan('createLiveTrade', async (span) => {
    try {
      const data = liveTradeSchema.parse(req.body);
      const trade: LiveTrade = {
        id: Math.random().toString(36).substring(2),
        ...data,
        entryDate: new Date(),
      };
      await sendMessage('trade-events', { event: 'TradeCreated', trade });
      span.setStatus({ code: SpanStatusCode.OK });
      res.status(StatusCodes.CREATED).json(trade);
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      res.status(StatusCodes.BAD_REQUEST).json({ error: (error as Error).message });
    } finally {
      span.end();
    }
  });
};

/**
 * Updates an existing live trade.
 * 
 * This function parses the request body using the update live trade schema, updates the trade with the provided ID, and sends a 'TradeUpdated' event to the trade-events topic.
 * 
 * @param {Request} req - The incoming request object.
 * @param {Response} res - The outgoing response object.
 * @returns {Promise<void>} A promise that resolves when the function completes.
 */
export const updateLiveTrade = async (req: Request, res: Response) => {
  return tracer.startActiveSpan('updateLiveTrade', async (span) => {
    try {
      const { id } = req.params;
      const data = updateLiveTradeSchema.parse(req.body);
      const trade: Partial<LiveTrade> = { id, ...data };
      await sendMessage('trade-events', { event: 'TradeUpdated', trade });
      span.setStatus({ code: SpanStatusCode.OK });
      res.json(trade);
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      res.status(StatusCodes.BAD_REQUEST).json({ error: (error as Error).message });
    } finally {
      span.end();
    }
  });
};

/**
 * Deletes a live trade.
 * 
 * This function extracts the trade ID from the request parameters and sends a 'TradeDeleted' event to the trade-events topic.
 * 
 * @param {Request} req - The incoming request object.
 * @param {Response} res - The outgoing response object.
 * @returns {Promise<void>} A promise that resolves when the function completes.
 */
export const deleteLiveTrade = async (req: Request, res: Response) => {
  return tracer.startActiveSpan('deleteLiveTrade', async (span) => {
    try {
      const { id } = req.params;
      await sendMessage('trade-events', { event: 'TradeDeleted', trade: { id } });
      span.setStatus({ code: SpanStatusCode.OK });
      res.status(204).send();
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      res.status(StatusCodes.BAD_REQUEST).json({ error: (error as Error).message });
    } finally {
      span.end();
    }
  });
};

/**
 * Closes a live trade.
 * 
 * This function extracts the trade ID from the request parameters and the exit price and fees from the request body,
 * then sends a 'TradeClosed' event to the trade-events topic.
 * 
 * @param {Request} req - The incoming request object.
 * @param {Response} res - The outgoing response object.
 * @returns {Promise<void>} A promise that resolves when the function completes.
 */
export const closeLiveTrade = async (req: Request, res: Response) => {
  return tracer.startActiveSpan('closeLiveTrade', async (span) => {
    try {
      const { id } = req.params;
      const { exitPrice, fees } = closeTradeSchema.parse(req.body);
      await sendMessage('trade-events', { event: 'TradeClosed', trade: { id, exitPrice, fees } });
      span.setStatus({ code: SpanStatusCode.OK });
      res.status(StatusCodes.OK).json({ message: 'Trade closed' });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      res.status(StatusCodes.BAD_REQUEST).json({ error: (error as Error).message });
    } finally {
      span.end();
    }
  });
};

/**
 * Retrieves all live trades for a specific account.
 * 
 * This function extracts the accountId from the request query parameters and fetches all live trades
 * associated with that account from the database.
 * 
 * @param {Request} req - The incoming request object.
 * @param {Response} res - The outgoing response object.
 * @returns {Promise<void>} A promise that resolves when the function completes.
 */
export const getLiveTradesHandler = async (req: Request, res: Response) => {
  return tracer.startActiveSpan('getLiveTrades', async (span) => {
    try {
      const { accountId } = req.query;
      if (!accountId || typeof accountId !== 'string') {
        throw new Error('accountId is required');
      }
      const trades = await getLiveTrades(accountId);
      span.setStatus({ code: SpanStatusCode.OK });
      res.json(trades);
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      res.status(StatusCodes.BAD_REQUEST).json({ error: (error as Error).message });
    } finally {
      span.end();
    }
  });
};

/**
 * Retrieves all closed trades for a specific account.
 * 
 * This function extracts the accountId from the request query parameters and fetches all closed trades
 * associated with that account from the database.
 * 
 * @param {Request} req - The incoming request object.
 * @param {Response} res - The outgoing response object.
 * @returns {Promise<void>} A promise that resolves when the function completes.
 */
export const getClosedTradesHandler = async (req: Request, res: Response) => {
  return tracer.startActiveSpan('getClosedTrades', async (span) => {
    try {
      const { accountId } = req.query;
      if (!accountId || typeof accountId !== 'string') {
        throw new Error('accountId is required');
      }
      const trades = await getClosedTrades(accountId);
      span.setStatus({ code: SpanStatusCode.OK });
      res.json(trades);
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      res.status(StatusCodes.BAD_REQUEST).json({ error: (error as Error).message });
    } finally {
      span.end();
    }
  });
};
