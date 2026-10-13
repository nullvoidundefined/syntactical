// Stands in for the RevenueCat webhook when REVENUECAT_WEBHOOK_AUTH is not configured (stub
// mode). It answers 503 to every request, before reading any body, and touches no database, so
// an unauthenticated webhook is never accepted or recorded.
import { Router } from 'express';

import { HTTP } from '../constants/http.js';
import { ERROR_CODES, sendError } from '../errors.js';

const {
  STATUS: { SERVICE_UNAVAILABLE },
} = HTTP;

function createDisabledWebhookRouter(): Router {
  const router = Router();
  router.use((_req, res) => {
    sendError(res, SERVICE_UNAVAILABLE, ERROR_CODES.WEBHOOK.NOT_CONFIGURED, 'Webhook not configured');
  });
  return router;
}

export { createDisabledWebhookRouter };
