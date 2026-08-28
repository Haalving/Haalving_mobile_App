import pino from 'pino';

import { env, isDev, isTest } from '../config/env.js';

/**
 * Structured logs, with the fields that carry a credential redacted.
 *
 * A one-time code in a log line is a one-time code someone can read: log
 * shipping, a screen share, a support ticket with a paste. The redaction list is
 * part of the security surface, not housekeeping.
 */
export const logger = pino({
  level: isTest ? 'silent' : isDev ? 'debug' : 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      'newPassword',
      'currentPassword',
      'passwordHash',
      'code',
      'codeHash',
      'token',
      'refreshToken',
      'accessToken',
      '*.password',
      '*.refreshToken',
    ],
    censor: '[redacted]',
  },
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
    : undefined,
  base: { env: env.NODE_ENV },
});
