/**
 * @module auth.middleware
 * @description Authentication middleware for handling JWT and local authentication strategies
 * using Passport.js with OpenTelemetry tracing.
 */

import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Strategy as LocalStrategy } from 'passport-local';
import { PrismaClient } from '@prisma/client';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import bcrypt from 'bcrypt';

/** Prisma client instance for database operations */
const prisma = new PrismaClient();
/** Secret key for JWT signing and verification */
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
/** OpenTelemetry tracer for monitoring authentication operations */
const tracer = trace.getTracer('trade-backend');

/**
 * Configure Passport's local authentication strategy
 * @description Verifies user credentials against the database
 */
passport.use(
  new LocalStrategy(
    /**
     * Verify callback for local strategy
     * @param {string} email - User's email address
     * @param {string} password - User's password
     * @param {Function} done - Passport callback to return result
     */
    async (email, password, done) => {
      try {
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user || !(await bcrypt.compare(password, user.password))) {
          return done(null, false, { message: 'Invalid credentials' });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);

/**
 * Configure Passport's JWT authentication strategy
 * @description Extracts JWT from cookies and verifies it
 */
passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req.cookies.jwt || null,
      ]),
      secretOrKey: JWT_SECRET,
    },
    /**
     * Verify callback for JWT strategy
     * @param {Object} payload - Decoded JWT payload
     * @param {Function} done - Passport callback to return result
     */
    async (payload, done) => {
      try {
        const user = await prisma.user.findUnique({ where: { id: payload.userId } });

        if (!user) {
          return done(null, false);
        }

        return done(null, user);
      } catch (error) {
        return done(error, false);
      }
    }
  )
);

/**
 * JWT authentication middleware
 * @description Authenticates requests using JWT strategy with OpenTelemetry tracing
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 * @returns {void}
 */
export const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
  return tracer.startActiveSpan('authenticateJWT', async (span) => {
    passport.authenticate('jwt', { session: false }, /**
     * JWT authentication callback
     * @param {Error} err - Error object if authentication failed
     * @param {any} user - User object if authentication succeeded
     */
      (err: Error, user: any) => {

        if (err || !user) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Unauthorized' });
          span.end();
          return res.status(401).json({ error: 'Unauthorized' });
        }

        req.user = user;
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();

        next();
      })(req, res, next);
  });
};

/**
 * Local authentication middleware
 * @description Authenticates requests using username/password with OpenTelemetry tracing
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 * @returns {void}
 */
export const authenticateLocal = (req: Request, res: Response, next: NextFunction) => {
  return tracer.startActiveSpan('authenticateLocal', async (span) => {
    passport.authenticate('local', { session: false }, /**
     * Local authentication callback
     * @param {Error} err - Error object if authentication failed
     * @param {any} user - User object if authentication succeeded
     * @param {Object} info - Additional info object, may contain error message
     */
      (err: Error, user: any, info: { message?: string; }) => {

        if (err || !user) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: info?.message || 'Authentication failed' });
          span.end();
          return res.status(401).json({ error: info?.message || 'Authentication failed' });
        }

        req.user = user;
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();

        next();
      })(req, res, next);
  });
};
