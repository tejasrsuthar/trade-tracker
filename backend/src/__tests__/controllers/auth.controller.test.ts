import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import {
  me,
  register,
  login,
  logout,
  refresh
} from '../../controllers/auth.controller';
import { defaultCookieOptions, refreshCookieOptions } from '../../lib/utils';

// Mock Prisma client
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn()
    },
    account: {
      create: jest.fn(),
      findMany: jest.fn()
    },
    refreshToken: {
      create: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn()
    },
    $transaction: jest.fn()
  };

  return {
    PrismaClient: jest.fn().mockImplementation(() => mockPrismaClient)
  };
});

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashedPassword'),
  compare: jest.fn().mockResolvedValue(true)
}));

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock-token'),
  verify: jest.fn().mockReturnValue({ userId: 'user-123' })
}));

// Mock Express Request and Response
const mockRequest = (body = {}, cookies = {}, user = {}) => {
  return {
    body,
    cookies,
    user,
    id: 'test-request-id'
  } as Request;
};

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
};

describe('Auth Controller', () => {
  let prisma: PrismaClient;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();
  });

  describe('me', () => {
    it('should return user information successfully', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
        Account: [{ id: 'account-123', name: 'Test Account' }]
      };

      const req = mockRequest({}, {}, { id: 'user-123' });
      const res = mockResponse();

      // Mock the findUnique method to return the mock user
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(mockUser);

      await me(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ user: mockUser });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: {
          password: false,
          id: true,
          email: true,
          createdAt: true,
          updatedAt: true,
          Account: true
        }
      });
    });

    it('should handle errors when fetching user information', async () => {
      const req = mockRequest({}, {}, { id: 'user-123' });
      const res = mockResponse();

      (prisma.user.findUnique as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      await me(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.INTERNAL_SERVER_ERROR);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Internal server error'
      }));
    });
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockAccount = {
        id: 'account-123',
        name: 'Test Account',
        userId: 'user-123'
      };

      const req = mockRequest({
        email: 'test@example.com',
        password: 'password123',
        account: {
          name: 'Test Account',
          startingBalance: 10000
        }
      });
      const res = mockResponse();

      (bcrypt.hash as jest.Mock).mockResolvedValueOnce('hashedPassword');
      (jwt.sign as jest.Mock).mockReturnValueOnce('mock-token').mockReturnValueOnce('mock-token');
      (prisma.$transaction as jest.Mock).mockResolvedValueOnce({
        user: mockUser,
        account: mockAccount,
        refreshToken: 'mock-token'
      });

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.CREATED);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User registered successfully',
        userId: 'user-123',
        accountId: 'account-123'
      }));
      expect(res.cookie).toHaveBeenCalledWith('jwt', 'mock-token', defaultCookieOptions);
      expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'mock-token', refreshCookieOptions);
    });

    it('should return 409 when email already exists', async () => {
      const req = mockRequest({
        email: 'existing@example.com',
        password: 'password123',
        account: {
          name: 'Test Account',
          startingBalance: 10000
        }
      });
      const res = mockResponse();

      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'existing-user' });

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.CONFLICT);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Registration failed: Email already exists'
      }));
    });

    it('should return 400 for invalid registration data', async () => {
      const req = mockRequest({
        email: 'invalid-email',
        password: '123', // Too short
        account: {
          name: '', // Empty name
          startingBalance: -100 // Negative balance
        }
      });
      const res = mockResponse();

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.any(Array)
      }));
    });
  });

  describe('login', () => {
    it('should login a user successfully', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        password: 'hashedPassword',
        Account: [{ id: 'account-123', name: 'Test Account' }]
      };

      const req = mockRequest({
        email: 'test@example.com',
        password: 'password123'
      });
      const res = mockResponse();

      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
      (jwt.sign as jest.Mock).mockReturnValueOnce('mock-token').mockReturnValueOnce('mock-token');

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User logged in successfully',
        userId: 'user-123',
        accountId: 'account-123'
      }));
      expect(res.cookie).toHaveBeenCalledWith('jwt', 'mock-token', defaultCookieOptions);
      expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'mock-token', refreshCookieOptions);
    });

    it('should return 401 for invalid credentials', async () => {
      const req = mockRequest({
        email: 'test@example.com',
        password: 'wrongpassword'
      });
      const res = mockResponse();

      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.UNAUTHORIZED);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Invalid login credentials'
      }));
    });

    it('should return 400 for invalid login data', async () => {
      const req = mockRequest({
        email: 'invalid-email',
        password: '123' // Too short
      });
      const res = mockResponse();

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.any(Array)
      }));
    });
  });

  describe('logout', () => {
    it('should logout a user successfully', async () => {
      const req = mockRequest({}, { refreshToken: 'valid-refresh-token' }, { id: 'user-123' });
      const res = mockResponse();

      (prisma.refreshToken.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

      await logout(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Logout successful'
      }));
      expect(res.clearCookie).toHaveBeenCalledWith('jwt');
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
    });

    it('should handle logout when no refresh token is present', async () => {
      const req = mockRequest({}, {}, { id: 'user-123' });
      const res = mockResponse();

      await logout(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Logout successful'
      }));
      expect(res.clearCookie).toHaveBeenCalledWith('jwt');
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
    });

    it('should handle errors during logout', async () => {
      const req = mockRequest({}, { refreshToken: 'valid-refresh-token' }, { id: 'user-123' });
      const res = mockResponse();

      (prisma.refreshToken.deleteMany as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      await logout(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.INTERNAL_SERVER_ERROR);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Internal server error'
      }));
    });
  });

  describe('refresh', () => {
    it('should refresh tokens successfully', async () => {
      const mockStoredToken = {
        id: 'token-123',
        token: 'valid-refresh-token',
        userId: 'user-123',
        expiresAt: new Date(Date.now() + 86400000), // 1 day in the future
        user: { id: 'user-123' }
      };

      const req = mockRequest({}, { refreshToken: 'valid-refresh-token' });
      const res = mockResponse();

      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValueOnce(mockStoredToken);
      (jwt.sign as jest.Mock).mockReturnValueOnce('mock-token').mockReturnValueOnce('mock-token');

      await refresh(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Token refreshed successfully'
      }));
      expect(res.cookie).toHaveBeenCalledWith('jwt', 'mock-token', defaultCookieOptions);
      expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'mock-token', refreshCookieOptions);
    });

    it('should return 401 when no refresh token is provided', async () => {
      const req = mockRequest({}, {});
      const res = mockResponse();

      await refresh(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.UNAUTHORIZED);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'No refresh token provided'
      }));
    });

    it('should return 401 when refresh token is invalid or expired', async () => {
      const mockStoredToken = {
        id: 'token-123',
        token: 'expired-refresh-token',
        userId: 'user-123',
        expiresAt: new Date(Date.now() - 86400000), // 1 day in the past
        user: { id: 'user-123' }
      };

      const req = mockRequest({}, { refreshToken: 'expired-refresh-token' });
      const res = mockResponse();

      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValueOnce(mockStoredToken);

      await refresh(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.UNAUTHORIZED);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Invalid refresh token'
      }));
    });

    it('should handle errors during token refresh', async () => {
      const req = mockRequest({}, { refreshToken: 'valid-refresh-token' });
      const res = mockResponse();

      (prisma.refreshToken.findUnique as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      await refresh(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.INTERNAL_SERVER_ERROR);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Internal server error'
      }));
    });
  });
}); 