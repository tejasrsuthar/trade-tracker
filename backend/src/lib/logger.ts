import pino from 'pino';

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

export const createLogger = (bindings: object) => logger.child(bindings);
export default logger;

