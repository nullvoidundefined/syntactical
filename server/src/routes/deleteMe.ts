// DELETE /v1/me (B-59): deletes the caller's account in one bounded transaction (see deleteUser),
// clears the session cookie, and answers 204. A cookie caller also needs the CSRF header (the
// global guard). A second concurrent delete finds the user gone and still answers 204, or 401
// when its session is already gone. Any failure rolls back and surfaces as a 500 through the
// error handler. The one log line carries the request id only, never the email or user id.
import { Router } from 'express';
import type { Logger } from 'pino';

import { withBoundedTransaction } from '../clients/withBoundedTransaction.js';
import { sessionCookieOptions } from '../config/sessionCookieOptions.js';
import { AUTH } from '../constants/auth.js';
import { HTTP } from '../constants/http.js';
import { createRequireSession } from '../middleware/requireSession.js';
import { deleteUser } from '../services/deleteUser.js';

import type { ResolvedAuthDeps } from './authDeps.js';

const {
  SESSION: { COOKIE_NAME },
} = AUTH;

function createDeleteMeRouter(deps: ResolvedAuthDeps, logger: Logger): Router {
  const { database, isCookieSecure, now, rateLimitKeySecret } = deps;
  const router = Router();

  router.delete('/me', createRequireSession({ database, now }), async (_req, res) => {
    const {
      logger: requestLogger,
      session: { userId },
    } = res.locals as { logger?: Logger; session: { userId: string } };
    const isDeleted = await withBoundedTransaction(database, (client) =>
      deleteUser(client, { rateLimitKeySecret, userId }),
    );
    if (isDeleted) {
      (requestLogger ?? logger).info({ event: 'account_deleted' }, 'account deleted');
    }
    res.clearCookie(COOKIE_NAME, sessionCookieOptions(isCookieSecure));
    res.status(HTTP.STATUS.NO_CONTENT).end();
  });

  return router;
}

export { createDeleteMeRouter };
