import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { trace, SpanStatusCode } from '@opentelemetry/api';

import { registerSchema, loginSchema, refreshSchema } from '../schemas/auth.schema';

const prisma = new PrismaClient();
const tracer = trace.getTracer('trade-backend');
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Registers a new user in the system.
 * @param {Request} req - Express request object containing user registration data in the body
 * @param {Response} res - Express response object
 * @returns {Promise<void>} - Returns a promise that resolves with the registration response
 * @throws {Error} - Throws an error if registration fails
 */
export const register = async (req: Request, res: Response) => {
  return tracer.startActiveSpan('register', async (span) => {
    try {
      const { email, password } = registerSchema.parse(req.body);
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: { email, password: hashedPassword },
      });

      const accessToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '15m' });
      const refreshToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      res.cookie('jwt', accessToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
      res.cookie('refresh', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
      span.setStatus({ code: SpanStatusCode.OK });
      res.status(201).json({ message: 'User registered', userId: user.id });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      res.status(400).json({ error: (error as Error).message });
    } finally {
      span.end();
    }
  });
};

/**
 * Authenticates a user and creates a new session.
 * @param {Request} req - Express request object containing the authenticated user
 * @param {Response} res - Express response object
 * @returns {Promise<void>} - Returns a promise that resolves with the login response
 * @throws {Error} - Throws an error if login fails or user is not found
 */
export const login = async (req: Request, res: Response) => {
  return tracer.startActiveSpan('login', async (span) => {
    try {
      const user = req.user as { id: string; email: string; };

      if (!user) throw new Error('User not found');

      const accessToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '15m' });
      const refreshToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      res.cookie('jwt', accessToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
      res.cookie('refresh', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
      span.setStatus({ code: SpanStatusCode.OK });
      res.json({ message: 'Logged in', userId: user.id });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      res.status(401).json({ error: (error as Error).message });
    } finally {
      span.end();
    }
  });
};

/**
 * Logs out a user by invalidating their refresh token and clearing cookies.
 * @param {Request} req - Express request object containing the refresh token in cookies
 * @param {Response} res - Express response object
 * @returns {Promise<void>} - Returns a promise that resolves with the logout response
 * @throws {Error} - Throws an error if logout operation fails
 */
export const logout = async (req: Request, res: Response) => {
  return tracer.startActiveSpan('logout', async (span) => {
    try {
      const refreshToken = req.cookies.refresh;

      if (refreshToken) {
        await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
      }
      res.clearCookie('jwt');
      res.clearCookie('refresh');
      span.setStatus({ code: SpanStatusCode.OK });
      res.json({ message: 'Logged out' });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      res.status(500).json({ error: (error as Error).message });
    } finally {
      span.end();
    }
  });
};

/**
 * Refreshes the user's access token using their refresh token.
 * @param {Request} req - Express request object containing the refresh token in cookies
 * @param {Response} res - Express response object
 * @returns {Promise<void>} - Returns a promise that resolves with the new access token
 * @throws {Error} - Throws an error if token refresh fails, token is invalid, or user is not found
 */
export const refresh = async (req: Request, res: Response) => {
  return tracer.startActiveSpan('refresh', async (span) => {
    try {
      const { refreshToken } = refreshSchema.parse({ refreshToken: req.cookies.refresh });
      const storedToken = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });

      if (!storedToken || new Date() > storedToken.expiresAt) {
        res.clearCookie('jwt');
        res.clearCookie('refresh');
        throw new Error('Invalid or expired refresh token');
      }

      const decoded = jwt.verify(refreshToken, JWT_SECRET) as { userId: string; };
      const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
      if (!user) throw new Error('User not found');

      const newAccessToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '15m' });
      res.cookie('jwt', newAccessToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
      span.setStatus({ code: SpanStatusCode.OK });
      res.json({ message: 'Token refreshed' });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      res.status(401).json({ error: (error as Error).message });
    } finally {
      span.end();
    }
  });
};