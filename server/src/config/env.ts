import { z } from 'zod';

const SECRET_MIN_LENGTH = 32;

// At least 32 characters once trimmed, so padding cannot satisfy the length.
const strongSecret = z.string().refine((value) => value.trim().length >= SECRET_MIN_LENGTH);

const envSchema = z.object({
  ALLOWED_ORIGINS: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  RATE_LIMIT_KEY_SECRET: strongSecret,
  REVENUECAT_WEBHOOK_AUTH: strongSecret,
});

type Env = z.infer<typeof envSchema>;

// Fails closed. The error names each offending variable and never includes a value.
function loadEnv(source: NodeJS.ProcessEnv): Env {
  const { data, error, success } = envSchema.safeParse(source);
  if (success) {
    return data;
  }
  const names = [...new Set(error.issues.map((issue) => issue.path.join('.')))];
  throw new Error(`Invalid environment: ${names.join(', ')}`);
}

export { loadEnv };
export type { Env };
