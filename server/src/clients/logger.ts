import { pino } from 'pino';
import type { Logger } from 'pino';

// Paths whose values never reach a log line: auth headers, cookies, and one-level email/code/token fields.
const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.email',
  '*.code',
  '*.token',
];

interface LoggerDestination {
  write(chunk: string): void;
}

function createLogger({ destination }: { destination: LoggerDestination }): Logger {
  return pino({ redact: { censor: '[REDACTED]', paths: REDACT_PATHS } }, destination);
}

export { createLogger, REDACT_PATHS };
export type { LoggerDestination };
