import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { PrismaClient } from '@prisma/client';

import {
  createLiveTrade,
  updateLiveTrade,
  deleteLiveTrade,
  closeLiveTrade,
  getLiveTradesHandler,
  getClosedTradesHandler
} from '../../controllers/trade.controller';
import { sendMessage } from '../../services/kafka.producer';
import { getLiveTrades, getClosedTrades } from '../../services/db.service';

// Mock the services
jest.mock('../../services/kafka.producer', () => ({
  sendMessage: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../services/db.service', () => ({
  getLiveTrades: jest.fn().mockResolvedValue([]),
  getClosedTrades: jest.fn().mockResolvedValue([])
}));

// Mock Express Request and Response
const mockRequest = (body = {}, params = {}, query = {}) => {
  return {
    body,
    params,
    query,
    id: 'test-request-id'
  } as Request;
};

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe('Trade Controller', () => {
  let prisma: PrismaClient;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();
  });

  describe('createLiveTrade', () => {
    it('should create a new live trade successfully', async () => {
      const req = mockRequest({
        symbol: 'AAPL',
        entryPrice: 150.00,
        quantity: 10,
        accountId: 'account-123'
      });
      const res = mockResponse();

      await createLiveTrade(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.CREATED);
      expect(sendMessage).toHaveBeenCalledWith('trade-events', expect.objectContaining({
        event: 'TradeCreated',
        trade: expect.objectContaining({
          symbol: 'AAPL',
          entryPrice: 150.00,
          quantity: 10,
          accountId: 'account-123'
        })
      }));
    });

    it('should return 400 for invalid trade data', async () => {
      const req = mockRequest({
        // Missing required fields
        symbol: 'AAPL'
      });
      const res = mockResponse();

      await createLiveTrade(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.any(String)
      }));
    });
  });

  describe('updateLiveTrade', () => {
    it('should update a live trade successfully', async () => {
      const req = mockRequest(
        { exitPrice: 160.00 },
        { id: 'trade-123' }
      );
      const res = mockResponse();

      await updateLiveTrade(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        id: 'trade-123',
        exitPrice: 160.00
      }));
      expect(sendMessage).toHaveBeenCalledWith('trade-events', expect.objectContaining({
        event: 'TradeUpdated',
        trade: expect.objectContaining({
          id: 'trade-123',
          exitPrice: 160.00
        })
      }));
    });

    it('should return 400 for invalid update data', async () => {
      const req = mockRequest(
        { exitPrice: 'invalid' },
        { id: 'trade-123' }
      );
      const res = mockResponse();

      await updateLiveTrade(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.any(String)
      }));
    });
  });

  describe('deleteLiveTrade', () => {
    it('should delete a live trade successfully', async () => {
      const req = mockRequest({}, { id: 'trade-123' });
      const res = mockResponse();

      await deleteLiveTrade(req, res);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(sendMessage).toHaveBeenCalledWith('trade-events', expect.objectContaining({
        event: 'TradeDeleted',
        trade: { id: 'trade-123' }
      }));
    });

    it('should handle errors during deletion', async () => {
      const req = mockRequest({}, { id: 'trade-123' });
      const res = mockResponse();

      (sendMessage as jest.Mock).mockRejectedValueOnce(new Error('Kafka error'));

      await deleteLiveTrade(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.any(String)
      }));
    });
  });

  describe('closeLiveTrade', () => {
    it('should close a live trade successfully', async () => {
      const req = mockRequest(
        { exitPrice: 160.00, fees: 5.00 },
        { id: 'trade-123' }
      );
      const res = mockResponse();

      await closeLiveTrade(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ message: 'Trade closed' });
      expect(sendMessage).toHaveBeenCalledWith('trade-events', expect.objectContaining({
        event: 'TradeClosed',
        trade: expect.objectContaining({
          id: 'trade-123',
          exitPrice: 160.00,
          fees: 5.00
        })
      }));
    });

    it('should return 400 for invalid close data', async () => {
      const req = mockRequest(
        { exitPrice: 'invalid', fees: 'invalid' },
        { id: 'trade-123' }
      );
      const res = mockResponse();

      await closeLiveTrade(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.any(String)
      }));
    });
  });

  describe('getLiveTradesHandler', () => {
    it('should get live trades successfully', async () => {
      const mockTrades = [
        { id: 'trade-1', symbol: 'AAPL', entryPrice: 150.00, quantity: 10 },
        { id: 'trade-2', symbol: 'GOOGL', entryPrice: 2500.00, quantity: 5 }
      ];

      const req = mockRequest({}, {}, { accountId: 'account-123' });
      const res = mockResponse();

      (getLiveTrades as jest.Mock).mockResolvedValueOnce(mockTrades);

      await getLiveTradesHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(mockTrades);
      expect(getLiveTrades).toHaveBeenCalledWith('account-123');
    });

    it('should return 400 when accountId is missing', async () => {
      const req = mockRequest({}, {}, {});
      const res = mockResponse();

      await getLiveTradesHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'accountId is required'
      }));
    });

    it('should handle errors when fetching live trades', async () => {
      const req = mockRequest({}, {}, { accountId: 'account-123' });
      const res = mockResponse();

      (getLiveTrades as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      await getLiveTradesHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.any(String)
      }));
    });
  });

  describe('getClosedTradesHandler', () => {
    it('should get closed trades successfully', async () => {
      const mockTrades = [
        { id: 'trade-1', symbol: 'AAPL', entryPrice: 150.00, exitPrice: 160.00, quantity: 10 },
        { id: 'trade-2', symbol: 'GOOGL', entryPrice: 2500.00, exitPrice: 2600.00, quantity: 5 }
      ];

      const req = mockRequest({}, {}, { accountId: 'account-123' });
      const res = mockResponse();

      (getClosedTrades as jest.Mock).mockResolvedValueOnce(mockTrades);

      await getClosedTradesHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(mockTrades);
      expect(getClosedTrades).toHaveBeenCalledWith('account-123');
    });

    it('should return 400 when accountId is missing', async () => {
      const req = mockRequest({}, {}, {});
      const res = mockResponse();

      await getClosedTradesHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'accountId is required'
      }));
    });

    it('should handle errors when fetching closed trades', async () => {
      const req = mockRequest({}, {}, { accountId: 'account-123' });
      const res = mockResponse();

      (getClosedTrades as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      await getClosedTradesHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.any(String)
      }));
    });
  });
}); 