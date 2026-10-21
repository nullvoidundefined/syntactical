// The app with its auth routes wired to a real database for one integration
// test: an injectable clock, a recording email client, a rate-limit key secret
// generated at run time, a fake breach client (every range empty unless the
// test passes one), password hash slots, an optional derivation wrapper, and the dummy password
// hash that password sign-in verifies against when no stored hash applies. Given an answer key,
// it also mounts the /v1 sync routes (GET and PATCH /v1/me among them) on the same clock.
import { randomBytes } from 'node:crypto';

import type { Router } from 'express';
import type pg from 'pg';
import type { Logger } from 'pino';

import { createTestApp } from './createTestApp.js';
import type { TestClock } from './createTestApp.js';
import type { Database } from '../../clients/database.js';
import { createFakePasswordBreachClient } from '../../testing/fakePasswordBreachClient.js';
import type { PasswordBreachClient } from '../../clients/passwordBreachClient.js';
import { AUTH } from '../../constants/auth.js';
import type { DeriveKey } from '../../services/passwordHash.js';
import { createPasswordHashSlots } from '../../services/passwordHashSlots.js';
import type { AnswerKey } from '../../types/AnswerKey.js';

const DEFAULT_HASH_CONCURRENCY = 2;

// A current-parameter stored string whose salt and key are random bytes, so no password is known
// to match it. Built without a derivation, so a test's derivation counter starts at zero.
function buildRandomDummyPasswordHash(): string {
  const { KEY_BYTES, LOG_N, P, R, SALT_BYTES } = AUTH.PASSWORD.HASH;
  const encode = (bytes: Buffer) => bytes.toString('base64').replace(/=+$/, '');
  const salt = encode(randomBytes(SALT_BYTES));
  const key = encode(randomBytes(KEY_BYTES));
  return `$scrypt$v=1$ln=${LOG_N},r=${R},p=${P}$${salt}$${key}`;
}

interface SentCode {
  code: string;
  email: string;
}

interface PasswordHashSlots {
  run<T>(task: () => Promise<T>): Promise<T>;
}

interface AuthTestAppOptions {
  // Mounts the /v1 sync routes too (GET /v1/me reads the profile), on `pool` and the test's clock.
  answerKey?: AnswerKey;
  // Replaces the pool for the auth routes only (health still uses `pool`), e.g. to make a query fail.
  database?: Database;
  // Wraps the scrypt derivation the auth routes use, to count or hold derivations.
  deriveKey?: DeriveKey;
  // The startup dummy hash for password sign-in; defaults to a random current-parameter string.
  dummyPasswordHash?: string;
  // Probe routes for one test, mounted after the auth routes; they get the test's clock.
  extraRoutes?: (router: Router, clock: TestClock) => void;
  isCookieSecure?: boolean;
  logger?: Logger;
  passwordBreachClient?: PasswordBreachClient;
  passwordHashSlots?: PasswordHashSlots;
  pool: pg.Pool;
  randomInt?: (min: number, max: number) => number;
  sendSignInCode?: (email: string, code: string) => Promise<void>;
}

export function createAuthTestApp(options: AuthTestAppOptions) {
  const {
    answerKey,
    database,
    deriveKey,
    dummyPasswordHash = buildRandomDummyPasswordHash(),
    extraRoutes,
    isCookieSecure = true,
    logger,
    passwordBreachClient = createFakePasswordBreachClient({}),
    passwordHashSlots = createPasswordHashSlots({
      concurrency: DEFAULT_HASH_CONCURRENCY,
      queueTimeoutMs: AUTH.PASSWORD.HASH_QUEUE_TIMEOUT_MS,
    }),
    pool,
    randomInt,
    sendSignInCode,
  } = options;
  const sentCodes: SentCode[] = [];
  const emailClient = {
    async sendSignInCode(email: string, code: string): Promise<void> {
      if (sendSignInCode) {
        await sendSignInCode(email, code);
      }
      sentCodes.push({ code, email });
    },
  };
  const { app, clock, rateLimitKeySecret } = createTestApp({
    auth: {
      database,
      ...(deriveKey ? { deriveKey } : {}),
      dummyPasswordHash,
      emailClient,
      isCookieSecure,
      passwordBreachClient,
      passwordHashSlots,
      randomInt,
    },
    extraRoutes,
    logger,
    pool,
    ...(answerKey ? { sync: { answerKey } } : {}),
  });
  return { app, clock, dummyPasswordHash, passwordBreachClient, rateLimitKeySecret, sentCodes };
}
