// The app with the RevenueCat webhook mounted against a real database for one integration
// test: a fixed clock, the Pro product ids from constants/proProducts.ts (the only products that
// change an entitlement), and the webhook authorization value generated at run time and returned.
// Every line the app logs, at every level and with no redaction applied, is captured so a test
// can prove a value never reached the log.
import type pg from 'pg';
import { pino } from 'pino';

import { createTestApp } from './createTestApp.js';

interface WebhookTestAppOptions {
  pool: pg.Pool;
}

export function createWebhookTestApp(options: WebhookTestAppOptions) {
  const { pool } = options;
  const logLines: string[] = [];
  const logger = pino(
    { level: 'trace' },
    {
      write(chunk: string) {
        logLines.push(chunk);
      },
    },
  );
  const { app, clock, revenueCatAuth } = createTestApp({ logger, pool, webhooks: true });
  return { app, logLines, now: clock.now, revenueCatAuth };
}
