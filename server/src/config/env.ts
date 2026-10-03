import { z } from 'zod';

const WEBHOOK_AUTH_MIN_LENGTH = 32;

const envSchema = z.object({
  ALLOWED_ORIGINS: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  RATE_LIMIT_KEY_SECRET: z.string().min(1),
  REVENUECAT_WEBHOOK_AUTH: z.string().min(WEBHOOK_AUTH_MIN_LENGTH),
});

type Env = z.infer<typeof envSchema>;

// Fails closed. The error names each offending variable and never includes a value.
function loadEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (result.success) {
    return result.data;
  }
  const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
  throw new Error(`Invalid environment: ${names.join(', ')}`);
}

export { loadEnv };
export type { Env };
