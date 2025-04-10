/**
 * @fileoverview Logger configuration using pino with pretty printing support.
 * @module logger
 */

import pino from 'pino';

/**
 * Base logger instance configured with pino-pretty transport.
 * @const {pino.Logger}
 * @default
 */
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      levelFirst: true,
      translateTime: 'SYS:standard',
    },
  },
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});

/**
 * Creates a child logger with additional context bindings.
 * @param {object} bindings - Object containing additional context to be added to log entries
 * @returns {pino.Logger} A new child logger instance with the specified bindings
 */
export const createLogger = (bindings: object) => logger.child(bindings);

/**
 * Default logger instance.
 * @exports
 * @type {pino.Logger}
 */
export default logger;

