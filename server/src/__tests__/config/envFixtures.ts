// A valid server environment for the config tests, with any variable overridden.
import { randomBytes } from 'node:crypto';

const SECRET_BYTES = 24;

function buildValidEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ALLOWED_ORIGINS: 'https://syntactical.dev',
    DATABASE_URL: 'postgres://localhost:5432/syntactical',
    EMAIL_FROM: 'Syntactical <sign-in@syntactical.dev>',
    NODE_ENV: 'test',
    RATE_LIMIT_KEY_SECRET: randomBytes(SECRET_BYTES).toString('hex'),
    RESEND_API_KEY: randomBytes(SECRET_BYTES).toString('hex'),
    REVENUECAT_WEBHOOK_AUTH: randomBytes(SECRET_BYTES).toString('hex'),
    ...overrides,
  };
}

export { buildValidEnv };
