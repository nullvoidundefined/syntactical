// GET /v1/banks/:language/:difficulty (B-37b): serves a paid bank's stored bytes, unchanged as
// application/json (a recorded exception to the { data } envelope), only to a session whose user
// holds a granted entitlement for the bank's product id. Every response from this router, errors
// included, is Cache-Control: private, no-store. Order: session (401), bank lookup in memory (404),
// entitlement checked on every request (403).
import { Router } from 'express';

import { HTTP } from '../constants/http.js';
import { ERROR_CODES, sendError } from '../errors.js';
import { createRequireSession } from '../middleware/requireSession.js';
import { hasEntitlement } from '../services/hasEntitlement.js';

import type { ResolvedBanksDeps } from './banksDeps.js';

const {
  STATUS: { FORBIDDEN, NOT_FOUND, OK },
} = HTTP;

function createBanksRouter(deps: ResolvedBanksDeps): Router {
  const { database, now, paidBanks } = deps;
  const router = Router();
  const requireSession = createRequireSession({ database, now });

  router.get(
    '/banks/:language/:difficulty',
    (_req, res, next) => {
      res.set('Cache-Control', 'private, no-store');
      next();
    },
    requireSession,
    async (req, res) => {
      const { session } = res.locals as { session: { userId: string } };
      const { difficulty, language } = req.params;
      const bank = paidBanks.get(`${language}/${difficulty}`);
      if (!bank) {
        sendError(res, NOT_FOUND, ERROR_CODES.ROUTING.NOT_FOUND, 'Not found');
        return;
      }
      const { body, productId } = bank;
      if (!(await hasEntitlement(database, session.userId, productId))) {
        sendError(res, FORBIDDEN, ERROR_CODES.ENTITLEMENT.REQUIRED, 'This bank requires a purchase');
        return;
      }
      res.status(OK).type('application/json').send(body);
    },
  );

  return router;
}

export { createBanksRouter };
