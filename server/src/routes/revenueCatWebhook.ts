// POST /v1/webhooks/revenuecat (B-39a): authenticates by the Authorization header before the
// body is read (401 WEBHOOK_UNAUTHORIZED), then reads its own 64 KB JSON body: a Content-Type
// that is not application/json is 415, malformed or empty JSON is 400, over the limit is 413, a
// body that is not a RevenueCat event is 400. A secret under 32 trimmed characters is refused
// when the router is built.
// An event type the server does not handle is 200 ignored. A handled event is recorded once and
// its entitlement recomputed (B-39b) in one transaction; a failure answers 500 so RevenueCat
// redelivers. The header, the payload, and the app user id are never logged.
import { timingSafeEqual } from 'node:crypto';

import express, { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';

import { HTTP } from '../constants/http.js';
import { REVENUECAT_EVENTS } from '../constants/revenueCatEvents.js';
import { WEBHOOKS } from '../constants/webhooks.js';
import { createErrorResponse, ERROR_CODES } from '../errors.js';
import { isJsonMediaType } from '../middleware/isJsonMediaType.js';
import { revenueCatSchemas } from '../schemas/revenueCatSchemas.js';
import { recordPurchaseEvent } from '../services/recordPurchaseEvent.js';
import { sha256 } from '../services/sha256.js';

import type { WebhookDeps } from './webhookDeps.js';

const {
  STATUS: { BAD_REQUEST, OK, UNAUTHORIZED, UNSUPPORTED_MEDIA_TYPE },
} = HTTP;

const { GRANT_TYPES, REVOKE_TYPES } = REVENUECAT_EVENTS;
const { BODY_LIMIT, MIN_AUTH_LENGTH } = WEBHOOKS;

const HANDLED_TYPES: ReadonlySet<string> = new Set([...GRANT_TYPES, ...REVOKE_TYPES]);

function createRevenueCatWebhookRouter(deps: WebhookDeps, logger: Logger): Router {
  const { database, paidProductIds, revenueCatAuth } = deps;
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
    const { requestId } = res.locals as { requestId: string };
    res.status(UNAUTHORIZED).json(createErrorResponse(ERROR_CODES.WEBHOOK.UNAUTHORIZED, 'Unauthorized', requestId));
  }

  function requireJsonBody(req: Request, res: Response, next: NextFunction): void {
    if (isJsonMediaType(req.headers['content-type'])) {
      next();
      return;
    }
    const { requestId } = res.locals as { requestId: string };
    res
      .status(UNSUPPORTED_MEDIA_TYPE)
      .json(
        createErrorResponse(
          ERROR_CODES.INPUT.UNSUPPORTED_MEDIA_TYPE,
          'Content-Type must be application/json',
          requestId,
        ),
      );
  }

  router.post(
    '/revenuecat',
    requireWebhookAuth,
    requireJsonBody,
    express.json({ limit: BODY_LIMIT }),
    async (req: Request, res: Response) => {
      const { logger: requestLogger, requestId } = res.locals as {
        logger?: Logger;
        requestId: string;
      };
      const { data, success } = revenueCatSchemas.webhook.safeParse(req.body);
      if (!success) {
        res
          .status(BAD_REQUEST)
          .json(createErrorResponse(ERROR_CODES.INPUT.INVALID_BODY, 'Invalid request body', requestId));
        return;
      }
      const { event } = data;
      if (!HANDLED_TYPES.has(event.type)) {
        res.status(OK).json({ data: { status: 'ignored' } });
        return;
      }
      const status = await recordPurchaseEvent({
        database,
        event,
        logger: requestLogger ?? logger,
        paidProductIds,
      });
      res.status(OK).json({ data: { status } });
    },
  );

  return router;
}

export { createRevenueCatWebhookRouter };
