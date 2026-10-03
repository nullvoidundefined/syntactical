import { pino } from 'pino';
import type { Logger } from 'pino';

import { redactDeep } from './redactDeep.js';

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

// pino resets the bindings formatter on every child, so redact child bindings here,
// and keep doing it for grandchildren.
function guardChildren(logger: Logger): Logger {
  const original = logger.child.bind(logger);
  Object.defineProperty(logger, 'child', {
    value: (bindings: Record<string, unknown>, options?: Parameters<Logger['child']>[1]) =>
      guardChildren(original(redactDeep(bindings), options) as unknown as Logger),
  });
  return logger;
}

function createLogger({ destination }: { destination: LoggerDestination }): Logger {
  const logger = pino(
    {
      formatters: { bindings: redactDeep, log: redactDeep },
      hooks: {
        // pino copies a bare Error's message into msg before any formatter runs, so
        // summarize the first argument (an Error or an object holding one) up front.
        logMethod(args, method) {
          const [first, ...rest] = args as unknown[];
          if (typeof first === 'object' && first !== null) {
            method.apply(this, [redactDeep(first as Record<string, unknown>), ...rest] as Parameters<typeof method>);
            return;
          }
          method.apply(this, args);
        },
      },
      redact: { censor: '[REDACTED]', paths: REDACT_PATHS },
      // formatters.log has already summarized any Error; the default err serializer would re-expand it.
      serializers: { err: (value: unknown) => value },
    },
    destination,
  );
  return guardChildren(logger);
}

export { createLogger };
