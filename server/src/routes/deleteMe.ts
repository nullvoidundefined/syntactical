// DELETE /v1/me (B-59.2): deletes the caller's account in one transaction (see deleteUser) and
// clears the session cookie for every caller. Any failure rolls back and surfaces as a 500
// through the error handler. After the commit it writes one `account deleted` info line through
// the request logger (B-59.3); neither the email nor the user id is logged here.
import { Router } from 'express';
import type { Logger } from 'pino';

import { withTransaction } from '../clients/withTransaction.js';
import { sessionCookieOptions } from '../config/sessionCookieOptions.js';
import { AUTH } from '../constants/auth.js';
import { HTTP } from '../constants/http.js';
import { createRequireSession } from '../middleware/requireSession.js';
import { deleteUser } from '../services/deleteUser.js';

import type { ResolvedAuthDeps } from './authDeps.js';

const {
  SESSION: { COOKIE_NAME },
} = AUTH;

function createDeleteMeRouter(deps: ResolvedAuthDeps): Router {
  const { database, isCookieSecure, now, rateLimitKeySecret } = deps;
  const router = Router();

  router.delete('/me', createRequireSession({ database, now }), async (_req, res) => {
    const {
      logger,
      session: { userId },
    } = res.locals as { logger?: Logger; session: { userId: string } };
    await withTransaction(database, (client) => deleteUser(client, { rateLimitKeySecret, userId }));
    logger?.info({ event: 'account_deleted' }, 'account deleted');
    res.clearCookie(COOKIE_NAME, sessionCookieOptions(isCookieSecure));
    res.status(HTTP.STATUS.NO_CONTENT).end();
  });

  return router;
}

export { createDeleteMeRouter };
