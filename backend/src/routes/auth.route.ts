/**
 * Express router for authentication endpoints.
 * @module routes/auth
 */
import express from 'express';
import { register, login, logout, refresh } from '../controllers/auth.controller';
import { authenticateLocal, authenticateJWT } from '../middleware/auth.middleware';

const router = express.Router();

/**
 * POST /api/auth/register
 * @description Register a new user
 * @route POST /register
 */
router.post('/register', register);

/**
 * POST /api/auth/login
 * @description Authenticate user and create session
 * @route POST /login
 * @middleware authenticateLocal - Validates user credentials
 */
router.post('/login', authenticateLocal, login);

/**
 * POST /api/auth/logout
 * @description Log out user and invalidate session
 * @route POST /logout
 */
router.post('/logout', authenticateJWT, logout);

/**
 * POST /api/auth/refresh
 * @description Refresh access token using refresh token
 * @route POST /refresh
 */
router.post('/refresh', refresh);

export default router;
