import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'api' },
  redact: ['req.headers.authorization', 'req.headers.cookie', 'password'],
});
