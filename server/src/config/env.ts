import { randomBytes } from 'node:crypto';
import { isAbsolute } from 'node:path';

import { z } from 'zod';

const SECRET_MIN_LENGTH = 32;

// At least 32 characters once trimmed, so padding cannot satisfy the length.
const strongSecret = z.string().refine((value) => value.trim().length >= SECRET_MIN_LENGTH);

// The one source for absolute URLs (sign-in links, webhooks), never the request's Host.
// Refuses credentials, a query, or a fragment, and stores a normalized base with no trailing slash.
const httpsUrl = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => {
    if (!URL.canParse(value)) {
      return false;
    }
    const { hash, password, protocol, search, username } = new URL(value);
    return protocol === 'https:' && !username && !password && !search && !hash;
  })
  .transform((value) => new URL(value).href.replace(/\/$/, ''));

const HASH_CONCURRENCY_MIN = 1;
const HASH_CONCURRENCY_MAX = 8;
const HASH_CONCURRENCY_DEFAULT = 2;

// An integer from 1 to 8 written as plain digits, so `2.5` and `-1` fail.
const hashConcurrency = z
  .string()
  .trim()
  .regex(/^\d+$/)
  .transform(Number)
  .refine((value) => value >= HASH_CONCURRENCY_MIN && value <= HASH_CONCURRENCY_MAX);

const envSchema = z.object({
  ALLOWED_ORIGINS: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  // The sign-in email's sender, for example `Syntactical <sign-in@syntactical.dev>`.
  EMAIL_FROM: z.string().trim().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Where paid banks live, outside the public content directory.
  PAID_CONTENT_DIR: z
    .string()
    .trim()
    .min(1)
    .refine((value) => isAbsolute(value)),
  // The cap on concurrent scrypt derivations; each holds about 128 MiB while it runs.
  PASSWORD_HASH_CONCURRENCY: hashConcurrency.default(HASH_CONCURRENCY_DEFAULT),
  PUBLIC_BASE_URL: httpsUrl,
  RATE_LIMIT_KEY_SECRET: strongSecret,
  RESEND_API_KEY: z.string().trim().min(1),
  REVENUECAT_WEBHOOK_AUTH: strongSecret,
});

const STUB_OPT_IN = 'ALLOW_STUBBED_INTEGRATIONS';
const RATE_LIMIT_STUB_BYTES = 32;

// Values that satisfy the schema for a variable that is missing under the opt-in. The two
// credentials get a placeholder only to pass validation: loadEnv removes them afterwards, so the
// placeholder never reaches the app. ALLOWED_ORIGINS is emptied afterwards (no origin allowed).
const STUBBABLE = {
  ALLOWED_ORIGINS: () => 'https://stub.invalid',
  EMAIL_FROM: () => 'Syntactical <stub@stub.invalid>',
  PUBLIC_BASE_URL: () => 'https://stub.invalid',
  // A fresh random value per boot, never logged: rate limit counters reset on each restart.
  RATE_LIMIT_KEY_SECRET: () => randomBytes(RATE_LIMIT_STUB_BYTES).toString('hex'),
  RESEND_API_KEY: () => 'stub',
  REVENUECAT_WEBHOOK_AUTH: () => 'stub'.repeat(SECRET_MIN_LENGTH),
} as const;

type StubbedIntegration = keyof typeof STUBBABLE;

type ParsedEnv = z.infer<typeof envSchema>;

// A stubbed credential is absent here, so no code path can use a placeholder as a secret.
type Env = Omit<ParsedEnv, 'RESEND_API_KEY' | 'REVENUECAT_WEBHOOK_AUTH'> & {
  RESEND_API_KEY: string | undefined;
  REVENUECAT_WEBHOOK_AUTH: string | undefined;
  // Names only, never values. Empty unless ALLOW_STUBBED_INTEGRATIONS=true and something was missing.
  stubbed: StubbedIntegration[];
};

function isMissing(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

// Fails closed. The error names each offending variable and never includes a value. Only a
// missing variable is ever stubbed, and only when ALLOW_STUBBED_INTEGRATIONS is exactly `true`;
// a present but invalid value still fails. DATABASE_URL and PAID_CONTENT_DIR are never stubbed.
function loadEnv(source: NodeJS.ProcessEnv): Env {
  const effective: NodeJS.ProcessEnv = { ...source };
  const stubbed: StubbedIntegration[] = [];
  if (source[STUB_OPT_IN] === 'true') {
    for (const name of Object.keys(STUBBABLE) as StubbedIntegration[]) {
      if (isMissing(source[name])) {
        effective[name] = STUBBABLE[name]();
        stubbed.push(name);
      }
    }
  }
  const { data, error, success } = envSchema.safeParse(effective);
  if (!success) {
    const names = [...new Set(error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment: ${names.join(', ')}`);
  }
  return {
    ...data,
    ALLOWED_ORIGINS: stubbed.includes('ALLOWED_ORIGINS') ? '' : data.ALLOWED_ORIGINS,
    RESEND_API_KEY: stubbed.includes('RESEND_API_KEY') ? undefined : data.RESEND_API_KEY,
    REVENUECAT_WEBHOOK_AUTH: stubbed.includes('REVENUECAT_WEBHOOK_AUTH') ? undefined : data.REVENUECAT_WEBHOOK_AUTH,
    stubbed,
  };
}

export { loadEnv };
export type { Env, StubbedIntegration };
