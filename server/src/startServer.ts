// Wires the API for one process: validates the environment, loads the answer key and the paid
// banks (refusing to start on a missing or tampered paid bank), opens the database pool, builds
// the app from those, and listens. No secret reaches a log line.
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';

import type { Logger } from 'pino';
import { Resend } from 'resend';

import { createApp } from './app.js';
import { createDatabasePool } from './clients/createDatabasePool.js';
import { createEmailClient } from './clients/emailClient.js';
import { createLogger } from './clients/logger.js';
import type { EmailClient } from './clients/emailTypes.js';
import { createHttpPasswordBreachClient } from './clients/passwordBreachClient.js';
import type { PasswordBreachClient } from './clients/passwordBreachClient.js';
import { createStubEmailClient } from './clients/stubEmailClient.js';
import { loadEnv } from './config/env.js';
import { isCookieSecure } from './config/isCookieSecure.js';
import { AUTH } from './constants/auth.js';
import { createDummyPasswordHash } from './services/passwordHash.js';
import { createPasswordHashSlots } from './services/passwordHashSlots.js';
import { readPaidBanks } from './services/readServerBank.js';
import { readServerManifest } from './services/readServerManifest.js';

const DEFAULT_PORT = 3001;
const MAX_PORT = 65_535;
// The compiled server sits at <root>/server/dist and the source at <root>/server/src, so both
// resolve the public content directory to <root>/content.
const DEFAULT_CONTENT_DIR = fileURLToPath(new URL('../../content', import.meta.url));

interface RunningServer {
  close(): Promise<void>;
  port: number;
}

interface StartOptions {
  // Test-only seam: replaces the email client so a test can read the sign-in codes. Accepted only
  // when NODE_ENV is exactly `test`; the production entrypoint never passes it.
  emailClient?: EmailClient;
  logger?: Logger;
  // Test-only seam: replaces the HIBP client. Refused outside NODE_ENV test, so a deployed
  // server cannot skip the real breach check.
  passwordBreachClient?: PasswordBreachClient;
}

function readPort(source: NodeJS.ProcessEnv): number {
  const { PORT: raw } = source;
  if (raw === undefined || raw.trim() === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > MAX_PORT) {
    throw new Error('Invalid environment: PORT');
  }
  return port;
}

function listen(app: ReturnType<typeof createApp>, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      server.off('error', reject);
      resolve(server);
    });
    server.once('error', reject);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    // Idle keep-alive sockets would otherwise hold close() open until they time out.
    server.closeIdleConnections();
  });
}

async function startServer(source: NodeJS.ProcessEnv, options: StartOptions = {}): Promise<RunningServer> {
  const { emailClient: injectedEmailClient, logger = createLogger({ destination: process.stdout }) } = options;
  if (injectedEmailClient !== undefined && source.NODE_ENV !== 'test') {
    throw new Error('An injected email client is allowed only when NODE_ENV is test');
  }
  if (options.passwordBreachClient !== undefined && source.NODE_ENV !== 'test') {
    throw new Error('An injected fake password breach client is allowed only when NODE_ENV is test');
  }
  const env = loadEnv(source);
  const port = readPort(source);
  const contentDir = source.CONTENT_DIR?.trim() || DEFAULT_CONTENT_DIR;
  const { ALLOWED_ORIGINS, DATABASE_URL, EMAIL_FROM, NODE_ENV, PAID_CONTENT_DIR } = env;

  const answerKey = await readServerManifest(contentDir, PAID_CONTENT_DIR);
  const paidBanks = await readPaidBanks(contentDir, PAID_CONTENT_DIR);
  const paidProductIds = new Set([...paidBanks.values()].map(({ productId }) => productId));

  const { RESEND_API_KEY, REVENUECAT_WEBHOOK_AUTH, stubbed } = env;
  if (stubbed.length > 0) {
    // Names only, never values. Rate limit counters reset on each restart while their key is a stub.
    logger.warn({ stubbed }, 'running with stubbed integrations');
  }

  const dummyPasswordHash = await createDummyPasswordHash();
  const pool = createDatabasePool(DATABASE_URL, NODE_ENV, logger);
  const app = createApp({
    admin: { database: pool, paidProductIds, rateLimitKeySecret: env.RATE_LIMIT_KEY_SECRET },
    allowedOrigins: ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    auth: {
      database: pool,
      dummyPasswordHash,
      emailClient:
        injectedEmailClient ??
        (RESEND_API_KEY === undefined
          ? createStubEmailClient(logger)
          : createEmailClient({ from: EMAIL_FROM, logger, resend: new Resend(RESEND_API_KEY) })),
      isCookieSecure: isCookieSecure(NODE_ENV),
      passwordBreachClient: options.passwordBreachClient ?? createHttpPasswordBreachClient(),
      passwordHashSlots: createPasswordHashSlots({
        concurrency: env.PASSWORD_HASH_CONCURRENCY,
        queueTimeoutMs: AUTH.PASSWORD.HASH_QUEUE_TIMEOUT_MS,
      }),
      rateLimitKeySecret: env.RATE_LIMIT_KEY_SECRET,
    },
    banks: { database: pool, paidBanks },
    db: pool,
    logger,
    stubbed,
    sync: { answerKey, database: pool, rateLimitKeySecret: env.RATE_LIMIT_KEY_SECRET },
    ...(REVENUECAT_WEBHOOK_AUTH === undefined
      ? { webhooksDisabled: true }
      : { webhooks: { database: pool, paidProductIds, revenueCatAuth: REVENUECAT_WEBHOOK_AUTH } }),
  });

  let server: Server;
  try {
    server = await listen(app, port);
  } catch (error) {
    await pool.end();
    throw error;
  }
  const address = server.address();
  const boundPort = typeof address === 'object' && address !== null ? address.port : port;
  logger.info({ port: boundPort }, 'server listening');

  return {
    async close() {
      // Stop accepting first, then end the pool once in-flight requests have finished.
      await closeServer(server);
      await pool.end();
    },
    port: boundPort,
  };
}

export { startServer };
export type { RunningServer };
