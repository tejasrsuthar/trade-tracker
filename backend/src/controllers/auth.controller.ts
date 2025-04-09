/**
 * Authentication Controller
 * @module controllers/auth
 */

import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { StatusCodes } from 'http-status-codes';

import { registerSchema, loginSchema } from '../schemas/auth.schema';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import logger from '../lib/logger';

const prisma = new PrismaClient();
const tracer = trace.getTracer('auth-service');

/**
 * Registers a new user with their account details
 * @param {Request} req - Express request object containing user and account details
 * @param {Response} res - Express response object
 * @returns {Promise<void>} JSON response with user and account IDs
 * @throws {Error} When registration fails
 */
export const register = async (req: Request, res: Response) => {
  return tracer.startActiveSpan('register_user', async (span) => {
    try {
      logger.info('Starting user registration process');
      const { email, password, account } = registerSchema.parse(req.body);
      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email,
            password: hashedPassword
          }
        });

        const newAccount = await tx.account.create({
          data: {
            name: account.name,
            startingBalance: account.startingBalance,
            userId: newUser.id
          }
        });

        // Create refresh token
        const refreshToken = jwt.sign(
          { userId: newUser.id },
          process.env.JWT_SECRET!,
          { expiresIn: '7d' }
        );

        await tx.refreshToken.create({
          data: {
            token: refreshToken,
            userId: newUser.id,
            expiresAt: getExpirationDate.refreshToken() // 7 days
          }
        });

        return { user: newUser, account: newAccount, refreshToken };
      });

      // Generate JWT token
      const token = jwt.sign(
        { userId: result.user.id },
        process.env.JWT_SECRET!,
        { expiresIn: '1h' }
      );

      // Set HTTP-only cookies
      res.cookie('jwt', token, defaultCookieOptions);
      res.cookie('refreshToken', result.refreshToken, refreshCookieOptions);

      span.setStatus({ code: SpanStatusCode.OK });
      logger.info({ userId: result.user.id }, 'User registered successfully');
      res.status(StatusCodes.CREATED).json({
        message: 'User registered successfully',
        userId: result.user.id,
        accountId: result.account.id
      });
    } catch (error: unknown) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error'
      });

      if (error instanceof z.ZodError) {
        logger.error({ error: error.errors }, 'Validation error during registration');
        return res.status(StatusCodes.BAD_REQUEST).json({ error: error.errors });
      }

      logger.error({ error }, 'Internal server error during registration');
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: 'Internal server error' });
    } finally {
      span.end();
    }
  });
};

/**
 * Authenticates a user and creates new session tokens
 * @param {Request} req - Express request object containing login credentials
 * @param {Response} res - Express response object
 * @returns {Promise<void>} JSON response with login status and user details
 * @throws {Error} When authentication fails
 */
export const login = async (req: Request, res: Response) => {
  return tracer.startActiveSpan('login_user', async (span) => {
    try {
      logger.info({ email: req.body.email }, 'User login attempt');
      const { email, password } = loginSchema.parse(req.body);

      const user = await prisma.user.findUnique({
        where: { email },
        include: { Account: true }
      });

      if (!user || !(await bcrypt.compare(password, user.password))) {
        logger.warn({ email: req.body.email }, 'Invalid login credentials');
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid credentials' });
        return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Invalid credentials' });
      }

      logger.info({ userId: user.id }, 'User logged in successfully');
      // Generate new tokens
      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '1h' });
      const refreshToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });

      // Upsert refresh token
      await prisma.refreshToken.upsert({
        where: { userId: user.id },
        update: {
          token: refreshToken,
          expiresAt: getExpirationDate.refreshToken() // 7d
        },
        create: {
          token: refreshToken,
          userId: user.id,
          expiresAt: getExpirationDate.refreshToken() // 7d
        }
      });

      // Set cookies
      res.cookie('jwt', token, defaultCookieOptions);
      res.cookie('refreshToken', refreshToken, refreshCookieOptions);

      span.setStatus({ code: SpanStatusCode.OK });
      res.status(StatusCodes.OK).json({
        message: 'Login successful',
        userId: user.id,
        accountId: user.Account[0].id
      });
    } catch (error: unknown) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error'
      });

      if (error instanceof z.ZodError) {
        return res.status(StatusCodes.BAD_REQUEST).json({ error: error.errors });
      }

      logger.error({ error }, 'Error during login');
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: 'Internal server error' });
    } finally {
      span.end();
    }
  });
};

/**
 * Logs out a user by invalidating their tokens
 * @param {Request} req - Express request object containing refresh token in cookies
 * @param {Response} res - Express response object
 * @returns {Promise<void>} JSON response confirming logout
 * @throws {Error} When logout operation fails
 */
export const logout = async (req: Request, res: Response) => {
  return tracer.startActiveSpan('logout_user', async (span) => {
    try {
      const refreshToken = req.cookies.refreshToken;

      if (refreshToken) {
        // Delete refresh token from database
        await prisma.refreshToken.deleteMany({
          where: { token: refreshToken }
        });
      }

      // Clear cookies
      res.clearCookie('jwt');
      res.clearCookie('refreshToken');

      span.setStatus({ code: SpanStatusCode.OK });
      res.status(StatusCodes.OK).json({ message: 'Logout successful' });
    } catch (error: unknown) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: 'Internal server error' });
    } finally {
      span.end();
    }
  });
};

/**
 * Refreshes the user's access token using their refresh token
 * @param {Request} req - Express request object containing refresh token in cookies
 * @param {Response} res - Express response object
 * @returns {Promise<void>} JSON response with new tokens
 * @throws {Error} When token refresh fails
 */
export const refresh = async (req: Request, res: Response) => {
  return tracer.startActiveSpan('refresh_token', async (span) => {
    try {
      const refreshToken = req.cookies.refreshToken;

      if (!refreshToken) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'No refresh token provided' });
        return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'No refresh token provided' });
      }

      // Verify refresh token
      const storedToken = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: true }
      });

      if (!storedToken || storedToken.expiresAt < new Date()) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid refresh token' });
        return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Invalid refresh token' });
      }

      // Generate new tokens
      const newToken = jwt.sign({ userId: storedToken.userId }, process.env.JWT_SECRET!, { expiresIn: '1h' });
      const newRefreshToken = jwt.sign({ userId: storedToken.userId }, process.env.JWT_SECRET!, { expiresIn: '7d' });

      // Update refresh token in database
      await prisma.$transaction(async (tx) => {
        await tx.refreshToken.delete({ where: { id: storedToken.id } });
        await tx.refreshToken.create({
          data: {
            token: newRefreshToken,
            userId: storedToken.userId,
            expiresAt: getExpirationDate.refreshToken()
          }
        });
      });

      // Set new cookies
      res.cookie('jwt', newToken, defaultCookieOptions); // 1 hour
      res.cookie('refreshToken', newRefreshToken, refreshCookieOptions); // 7 days

      span.setStatus({ code: SpanStatusCode.OK });
      res.status(StatusCodes.OK).json({ message: 'Token refreshed successfully' });
    } catch (error: unknown) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: 'Internal server error' });
    } finally {
      span.end();
    }
  });
};

/**
 * Cookie options interface for token storage
 * @interface CookieOptions
 */
interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  maxAge: number;
}

/**
 * Default cookie configuration for JWT tokens
 * @type {CookieOptions}
 */
// Add these constants after the tracer initialization
const ONE_HOUR_MS = 3600000; // 1 hour in milliseconds
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Token expiration dates
 */
const getExpirationDate = {
  refreshToken: () => new Date(Date.now() + SEVEN_DAYS_MS),
  accessToken: () => new Date(Date.now() + ONE_HOUR_MS)
};

const defaultCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  maxAge: ONE_HOUR_MS
};

const refreshCookieOptions: CookieOptions = {
  ...defaultCookieOptions,
  maxAge: SEVEN_DAYS_MS
};