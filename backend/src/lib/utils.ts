import { CookieOptions } from '../types';

/**
 * Default cookie configuration for JWT tokens
 * @type {CookieOptions}
 */
const ONE_HOUR_MS = 3600000; // 1 hour in milliseconds
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Token expiration dates
 */
export const getExpirationDate = {
  refreshToken: () => new Date(Date.now() + SEVEN_DAYS_MS),
  accessToken: () => new Date(Date.now() + ONE_HOUR_MS)
};

export const defaultCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  maxAge: ONE_HOUR_MS
};

export const refreshCookieOptions: CookieOptions = {
  ...defaultCookieOptions,
  maxAge: SEVEN_DAYS_MS
};