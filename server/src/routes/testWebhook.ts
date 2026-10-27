// POST /v1/test/webhook (plan "Seams and fixtures"): the RevenueCat webhook without its
// Authorization check, for the fixture purchase client and e2e. It takes the same body, under the
// same 64 KB JSON limit, and runs the same intake (revenueCatEventHandler.ts), so
// recordPurchaseEvent, recomputeEntitlement, and /v1/me run unchanged. startServer mounts it only
// for the testWebhook start option, which only e2e/support/runApi.mts passes and which is refused
// outside NODE_ENV=test; any other server answers 404.
import express, { Router } from 'express';
import type { Logger } from 'pino';

import { WEBHOOKS } from '../constants/webhooks.js';

import { createRevenueCatEventHandler, requireJsonBody } from './revenueCatEventHandler.js';
import type { TestWebhookDeps } from './testWebhookDeps.js';

function createTestWebhookRouter(deps: TestWebhookDeps, logger: Logger): Router {
  const { acceptSandbox, database } = deps;
  const router = Router();
  router.post(
    '/webhook',
    requireJsonBody,
    express.json({ limit: WEBHOOKS.BODY_LIMIT }),
    createRevenueCatEventHandler({ acceptSandbox, database, logger }),
  );
  return router;
}

export { createTestWebhookRouter };
