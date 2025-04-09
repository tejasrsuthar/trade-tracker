import { z } from 'zod';

/**
 * Schema for user registration validation
 * @property {string} email - User's email address (must be valid email format)
 * @property {string} password - User's password (minimum 6 characters)
 */
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  account: z.object({
    name: z.string(),
    startingBalance: z.number().positive()
  })
});

/**
 * Schema for user login validation
 * @property {string} email - User's email address (must be valid email format)
 * @property {string} password - User's password (minimum 6 characters)
 */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

/**
 * Schema for token refresh validation
 * @property {string} refreshToken - Valid refresh token (non-empty string)
 */
export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

/**
 * Type definition for registration request body
 */
export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Type definition for login request body
 */
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Type definition for refresh token request body
 */
export type RefreshInput = z.infer<typeof refreshSchema>;
