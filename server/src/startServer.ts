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
import { loadEnv } from './config/env.js';
import { isCookieSecure } from './config/isCookieSecure.js';
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
  logger?: Logger;
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
  const { logger = createLogger({ destination: process.stdout }) } = options;
  const env = loadEnv(source);
  const port = readPort(source);
  const contentDir = source.CONTENT_DIR?.trim() || DEFAULT_CONTENT_DIR;
  const { ALLOWED_ORIGINS, DATABASE_URL, EMAIL_FROM, NODE_ENV, PAID_CONTENT_DIR } = env;

  const answerKey = await readServerManifest(contentDir, PAID_CONTENT_DIR);
  const paidBanks = await readPaidBanks(contentDir, PAID_CONTENT_DIR);
  const paidProductIds = new Set([...paidBanks.values()].map(({ productId }) => productId));

  const pool = createDatabasePool(DATABASE_URL, NODE_ENV, logger);
  const app = createApp({
    allowedOrigins: ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    auth: {
      database: pool,
      emailClient: createEmailClient({ from: EMAIL_FROM, logger, resend: new Resend(env.RESEND_API_KEY) }),
      isCookieSecure: isCookieSecure(NODE_ENV),
      rateLimitKeySecret: env.RATE_LIMIT_KEY_SECRET,
    },
    banks: { database: pool, paidBanks },
    db: pool,
    logger,
    sync: { answerKey, database: pool, rateLimitKeySecret: env.RATE_LIMIT_KEY_SECRET },
    webhooks: { database: pool, paidProductIds, revenueCatAuth: env.REVENUECAT_WEBHOOK_AUTH },
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
