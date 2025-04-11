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
import { createLogger } from '../lib/logger';
import { getExpirationDate, defaultCookieOptions, refreshCookieOptions } from '../lib/utils';

const prisma = new PrismaClient();
const tracer = trace.getTracer('trade-backend');
const authLogger = createLogger({ module: 'auth', component: 'controller' });

/**
 * Retrieves user information (excluding password)
 * @param {Request} req - Express request object containing user information
 * @param {Response} res - Express response object
 * @returns {Promise<Response>} Promise that resolves to a Response object with user information (excluding password)
 * @throws {Error} When user information retrieval fails
 */
export const me = async (req: Request, res: Response) => {
  const requestLogger = authLogger.child({
    requestId: req.id,
    method: 'me',
  });

  const span = tracer.startSpan('auth_controller_me');

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        password: false,
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        Account: true
      }
    });

    const successMessage = 'User information retrieved successfully';
    requestLogger.info({ userId: req.user.id }, successMessage);
    span.setStatus({ code: SpanStatusCode.OK, message: successMessage });

    return res.status(StatusCodes.OK).json({ user });
  } catch (error: unknown) {
    const errorMessage = 'Internal server error';
    span.recordException(error as Error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
    requestLogger.error({ error }, errorMessage);

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: errorMessage });
  } finally {
    span.end();
  }
};

/**
 * Registers a new user with their account details
 * @param {Request} req - Express request object containing user and account details
 * @param {Response} res - Express response object
 * @returns {Promise<Response>} Promise that resolves to a Response object with user and account IDs
 * @throws {Error} When registration fails
 */
export const register = async (req: Request, res: Response) => {
  const requestLogger = authLogger.child({
    requestId: req.id,
    method: 'register',
  });

  const span = tracer.startSpan('auth_controller_register');

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
      span.recordException(new Error(errorMessage));
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

    return res.status(StatusCodes.CREATED).json({
      message: successMessage,
      userId: result.user.id,
      accountId: result.account.id
    });
  } catch (error: unknown) {
    const errorMessage = 'Internal server error';
    span.recordException(error as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : errorMessage
    });

    if (error instanceof z.ZodError) {
      requestLogger.error({ error: error.errors }, 'Validation error during registration');
      return res.status(StatusCodes.BAD_REQUEST).json({ error: error.errors });
    }

    requestLogger.error({ error }, errorMessage);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: errorMessage });
  } finally {
    span.end();
  }
};

/**
 * Authenticates a user and creates new session tokens
 * @param {Request} req - Express request object containing login credentials
 * @param {Response} res - Express response object
 * @returns {Promise<Response>} Promise that resolves to a Response object with login status and user details
 * @throws {Error} When authentication fails
 */
export const login = async (req: Request, res: Response) => {
  const requestLogger = authLogger.child({
    requestId: req.id,
    method: 'login',
  });

  const span = tracer.startSpan('auth_controller_login');

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
      span.recordException(new Error(errorMessage));
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

    return res.status(StatusCodes.OK).json({
      message: successMessage,
      userId: user.id,
      accountId: user.Account[0].id
    });
  } catch (error: unknown) {
    const errorMessage = 'Internal server error';
    span.recordException(error as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : errorMessage
    });

    if (error instanceof z.ZodError) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: error.errors });
    }

    requestLogger.error({ error }, errorMessage);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: errorMessage });
  } finally {
    span.end();
  }
};

/**
 * Logs out a user by invalidating their tokens
 * @param {Request} req - Express request object containing refresh token in cookies
 * @param {Response} res - Express response object
 * @returns {Promise<Response>} Promise that resolves to a Response object confirming logout
 * @throws {Error} When logout operation fails
 */
export const logout = async (req: Request, res: Response) => {
  const requestLogger = authLogger.child({
    requestId: req.id,
    method: 'logout',
  });

  const span = tracer.startSpan('auth_controller_logout');

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

    return res.status(StatusCodes.OK).json({ message: successMessage });
  } catch (error: unknown) {
    const errorMessage = 'Internal server error';
    requestLogger.error({ error }, errorMessage);
    span.recordException(error as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : errorMessage
    });

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: errorMessage });
  } finally {
    span.end();
  }
};

/**
 * Refreshes the user's access token using their refresh token
 * @param {Request} req - Express request object containing refresh token in cookies
 * @param {Response} res - Express response object
 * @returns {Promise<Response>} Promise that resolves to a Response object with new tokens
 * @throws {Error} When token refresh fails
 */
export const refresh = async (req: Request, res: Response) => {
  const requestLogger = authLogger.child({
    requestId: req.id,
    method: 'refresh',
  });

  const span = tracer.startSpan('auth_controller_refresh');

  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      const errorMessage = "No refresh token provided";
      requestLogger.error({ error: errorMessage });
      span.recordException(new Error(errorMessage));
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
      span.recordException(new Error(errorMessage));
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

    return res.status(StatusCodes.OK).json({ message: successMessage });
  } catch (error: unknown) {
    const errorMessage = 'Internal server error';
    requestLogger.error({ error }, errorMessage);
    span.recordException(error as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : errorMessage
    });

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: errorMessage });
  } finally {
    span.end();
  }
};
