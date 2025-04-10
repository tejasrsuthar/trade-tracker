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
import logger, { createLogger } from '../lib/logger';

const prisma = new PrismaClient();
const tracer = trace.getTracer('auth-service');
const authLogger = createLogger({ module: 'auth', component: 'controller' });

/**
 * Registers a new user with their account details
 * @param {Request} req - Express request object containing user and account details
 * @param {Response} res - Express response object
 * @returns {Promise<void>} JSON response with user and account IDs
 * @throws {Error} When registration fails
 */
export const register = async (req: Request, res: Response) => {
  const requestLogger = authLogger.child({
    requestId: req.id,
    method: 'register',
  });

  return tracer.startActiveSpan('register_user', async (span) => {
    try {
      requestLogger.info('Starting user registration process');
      const { email, password, account } = registerSchema.parse(req.body);

      // Check if user with this email already exists
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        const errorMessage = 'Registration failed: Email already exists';
        requestLogger.warn({ email }, errorMessage);
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
        return res.status(StatusCodes.CONFLICT).json({ error: errorMessage });
      }

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

      const successMessage = 'User registered successfully';
      span.setStatus({ code: SpanStatusCode.OK, message: successMessage });
      requestLogger.info({ userId: result.user.id }, successMessage);

      res.status(StatusCodes.CREATED).json({
        message: successMessage,
        userId: result.user.id,
        accountId: result.account.id
      });
    } catch (error: unknown) {
      const errorMessage = 'Internal server error';
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : errorMessage
      });

      if (error instanceof z.ZodError) {
        requestLogger.error({ error: error.errors }, 'Validation error during registration');
        return res.status(StatusCodes.BAD_REQUEST).json({ error: error.errors });
      }

      requestLogger.error({ error }, errorMessage);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: errorMessage });
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
  const requestLogger = authLogger.child({
    requestId: req.id,
    method: 'login',
  });

  return tracer.startActiveSpan('login_user', async (span) => {
    try {
      requestLogger.info({ email: req.body.email }, 'User login attempt');
      const { email, password } = loginSchema.parse(req.body);

      const user = await prisma.user.findUnique({
        where: { email },
        include: { Account: true }
      });

      if (!user || !(await bcrypt.compare(password, user.password))) {
        const errorMessage = 'Invalid login credentials';
        requestLogger.warn({ email: req.body.email }, errorMessage);
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });

        return res.status(StatusCodes.UNAUTHORIZED).json({ error: errorMessage });
      }

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

      const successMessage = 'User logged in successfully';
      requestLogger.info({ userId: user.id }, successMessage);
      span.setStatus({ code: SpanStatusCode.OK, message: successMessage });

      res.status(StatusCodes.OK).json({
        message: successMessage,
        userId: user.id,
        accountId: user.Account[0].id
      });
    } catch (error: unknown) {
      const errorMessage = 'Internal server error';

      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : errorMessage
      });

      if (error instanceof z.ZodError) {
        return res.status(StatusCodes.BAD_REQUEST).json({ error: error.errors });
      }

      requestLogger.error({ error }, errorMessage);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: errorMessage });
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
  const requestLogger = authLogger.child({
    requestId: req.id,
    method: 'logout',
  });

  return tracer.startActiveSpan('logout_user', async (span) => {
    try {
      const refreshToken = req.cookies.refreshToken;

      requestLogger.info({ refreshToken }, 'Logout attempt');
      if (refreshToken) {
        // Delete refresh token from database
        await prisma.refreshToken.deleteMany({
          where: { token: refreshToken }
        });
        requestLogger.info({ userId: req.user.id }, 'Refresh token deleted');
      }

      // Clear cookies
      res.clearCookie('jwt');
      res.clearCookie('refreshToken');

      const successMessage = 'Logout successful';
      requestLogger.info({ userId: req.user.id }, successMessage);
      span.setStatus({ code: SpanStatusCode.OK, message: successMessage });

      res.status(StatusCodes.OK).json({ message: successMessage });
    } catch (error: unknown) {
      const errorMessage = 'Internal server error';
      requestLogger.error({ error }, errorMessage);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : errorMessage
      });

      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: errorMessage });
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
  const requestLogger = authLogger.child({
    requestId: req.id,
    method: 'refresh',
  });

  return tracer.startActiveSpan('refresh_token', async (span) => {
    try {
      const refreshToken = req.cookies.refreshToken;

      if (!refreshToken) {
        const errorMessage = "No refresh token provided";
        requestLogger.error({ error: errorMessage });
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });

        return res.status(StatusCodes.UNAUTHORIZED).json({ error: errorMessage });
      }

      // Verify refresh token
      const storedToken = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: true }
      });

      if (!storedToken || storedToken.expiresAt < new Date()) {
        const errorMessage = 'Invalid refresh token';
        requestLogger.error({ error: errorMessage });
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });

        return res.status(StatusCodes.UNAUTHORIZED).json({ error: errorMessage });
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

      const successMessage = 'Token refreshed successfully';
      requestLogger.info({ userId: req.user.id }, successMessage);
      span.setStatus({ code: SpanStatusCode.OK, message: successMessage });

      res.status(StatusCodes.OK).json({ message: successMessage });
    } catch (error: unknown) {
      const errorMessage = 'Internal server error';
      requestLogger.error({ error }, errorMessage);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : errorMessage
      });

      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: errorMessage });
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