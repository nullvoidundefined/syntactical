// POST /v1/webhooks/revenuecat (B-39a): authenticates by the Authorization header before the
// body is read (401 WEBHOOK_UNAUTHORIZED), then reads its own 64 KB JSON body: a Content-Type
// that is not application/json is 415, malformed or empty JSON is 400, over the limit is 413. A
// secret under 32 trimmed characters is refused when the router is built. What follows
// authentication is the shared intake (revenueCatEventHandler.ts): the event type is read first,
// an unhandled type is 200 ignored and recorded nowhere, a handled event that is not a RevenueCat
// purchase event is 400, and a handled event is recorded once and its entitlement recomputed
// (B-39b) in one transaction; a failure answers 500 so RevenueCat redelivers. The header, the
// payload, and the app user id are never logged.
import { timingSafeEqual } from 'node:crypto';

import express, { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';

import { HTTP } from '../constants/http.js';
import { WEBHOOKS } from '../constants/webhooks.js';
import { ERROR_CODES, sendError } from '../errors.js';
import { sha256 } from '../services/sha256.js';

import { createRevenueCatEventHandler, requireJsonBody } from './revenueCatEventHandler.js';
import type { WebhookDeps } from './webhookDeps.js';

const {
  STATUS: { UNAUTHORIZED },
} = HTTP;

const { BODY_LIMIT, MIN_AUTH_LENGTH } = WEBHOOKS;

function createRevenueCatWebhookRouter(deps: WebhookDeps, logger: Logger): Router {
  const { database, revenueCatAuth } = deps;
  if (revenueCatAuth.trim().length < MIN_AUTH_LENGTH) {
    throw new Error(`webhooks.revenueCatAuth must be at least ${MIN_AUTH_LENGTH} characters`);
  }
  const expectedDigest = sha256(revenueCatAuth);
  const router = Router();

  // Digests have equal length, so the compare takes the same time whatever the sent value.
  function requireWebhookAuth(req: Request, res: Response, next: NextFunction): void {
    const sent = req.headers.authorization ?? '';
    if (timingSafeEqual(sha256(sent), expectedDigest)) {
      next();
      return;
    }
    sendError(res, UNAUTHORIZED, ERROR_CODES.WEBHOOK.UNAUTHORIZED, 'Unauthorized');
  }

  router.post(
    '/revenuecat',
    requireWebhookAuth,
    requireJsonBody,
    express.json({ limit: BODY_LIMIT }),
    createRevenueCatEventHandler({ database, logger }),
  );

  return router;
}

export { createRevenueCatWebhookRouter };
