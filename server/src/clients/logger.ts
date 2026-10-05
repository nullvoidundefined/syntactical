import { pino } from 'pino';
import type { Logger } from 'pino';

// Keys whose values never reach a log line, at the top level or one level down.
const SENSITIVE_KEYS = [
  'authorization',
  'code',
  'cookie',
  'currentPassword',
  'email',
  'newPassword',
  'otp',
  'password',
  'secret',
  'token',
];

const REDACT_PATHS = [
  ...SENSITIVE_KEYS.flatMap((key) => [key, `*.${key}`]),
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
];

interface LoggerDestination {
  write(chunk: string): void;
}

// An Error is logged by name, pg code, and constraint only: its message, detail, and
// stack can carry user data such as an email from a unique violation.
function serializeError(value: unknown): Record<string, unknown> {
  const { code, constraint, name } = (value ?? {}) as { code?: unknown; constraint?: unknown; name?: unknown };
  return {
    constraint: typeof constraint === 'string' ? constraint : undefined,
    name: typeof name === 'string' ? name : typeof value,
    pgCode: typeof code === 'string' ? code : undefined,
  };
}

function createLogger({ destination }: { destination: LoggerDestination }): Logger {
  return pino(
    {
      hooks: {
        // With no message argument pino copies the Error's message into msg, whether the
        // Error is the first argument or under err; log it under err with its name as msg.
        logMethod(args, method) {
          const [first, ...rest] = args as unknown[];
          const err = first instanceof Error ? first : (first as { err?: unknown } | null)?.err;
          const object = first instanceof Error ? { err: first } : first;
          const message = rest.length === 0 && err instanceof Error ? [err.name] : rest;
          method.apply(this, [object, ...message] as Parameters<typeof method>);
        },
      },
      redact: { censor: '[REDACTED]', paths: REDACT_PATHS },
      serializers: { cause: serializeError, err: serializeError },
    },
    destination,
  );
}

export { createLogger };
