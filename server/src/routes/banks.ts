// GET /v1/banks/:language/:difficulty (B-37b): serves a paid bank's stored bytes, unchanged as
// application/json (a recorded exception to the { data } envelope), only to a session whose user
// holds a granted entitlement for the bank's product id. Every response from this router, errors
// included, is Cache-Control: private, no-store. Order: session (401), bank lookup in memory (404),
// entitlement checked on every request (403).
import { Router } from 'express';

import { HTTP } from '../constants/http.js';
import { createErrorResponse, ERROR_CODES } from '../errors.js';
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
      const { requestId, session } = res.locals as { requestId: string; session: { userId: string } };
      const { difficulty, language } = req.params;
      const bank = paidBanks.get(`${language}/${difficulty}`);
      if (!bank) {
        res.status(NOT_FOUND).json(createErrorResponse(ERROR_CODES.ROUTING.NOT_FOUND, 'Not found', requestId));
        return;
      }
      const { body, productId } = bank;
      if (!(await hasEntitlement(database, session.userId, productId))) {
        res
          .status(FORBIDDEN)
          .json(createErrorResponse(ERROR_CODES.ENTITLEMENT.REQUIRED, 'This bank requires a purchase', requestId));
        return;
      }
      res.status(OK).type('application/json').send(body);
    },
  );

  return router;
}

export { createBanksRouter };
