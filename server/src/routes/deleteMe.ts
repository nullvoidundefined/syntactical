// DELETE /v1/me (B-59.2): rate limited per client IP, then session-checked, then per user (B-59.12; both
// on the pool, outside the deletion transaction, so a failed deletion still counts); deletes the caller's account in one transaction (see deleteUser) and
// clears the session cookie for every caller. Any failure rolls back and surfaces as a 500
// through the error handler. After the commit, when this request deleted the user (B-59.6: a duplicate
// concurrent deletion changes nothing and logs nothing, still 204), it writes one `account deleted` info line through
// the request logger (B-59.3); neither the email nor the user id is logged here. A scrub over its row or byte cap
// (DeletionTooLargeError, B-59.13) rolls back and answers 503 SERVER_BUSY, with no `account deleted` line.
import { Router } from 'express';
import type { Logger } from 'pino';

import { withTransaction } from '../clients/withTransaction.js';
import { sessionCookieOptions } from '../config/sessionCookieOptions.js';
import { AUTH } from '../constants/auth.js';
import { HTTP } from '../constants/http.js';
import { createErrorResponse, ERROR_CODES } from '../errors.js';
import { createRateLimit } from '../middleware/rateLimit.js';
import { createRequireSession } from '../middleware/requireSession.js';
import { deleteUser } from '../services/deleteUser.js';
import { DeletionTooLargeError } from '../services/deletionTooLargeError.js';
import { ipRateLimitKey } from '../services/ipRateLimitKey.js';

import type { ResolvedAuthDeps } from './authDeps.js';

const {
  RATE_LIMIT: { DELETE_PER_IP, DELETE_PER_USER, WINDOW_MS },
  RATE_LIMIT_SCOPE: { DELETE_IP, DELETE_USER },
  SESSION: { COOKIE_NAME },
} = AUTH;

function createDeleteMeRouter(deps: ResolvedAuthDeps): Router {
  const {
    database,
    deletionScrubMaxBytes,
    deletionScrubMaxRows,
    deletionStatementTimeoutMs,
    isCookieSecure,
    now,
    rateLimitKeySecret,
  } = deps;
  const router = Router();

  const limits = { database, keySecret: rateLimitKeySecret, now, windowMs: WINDOW_MS };
  const perIp = createRateLimit({
    ...limits,
    keyOf: (req) => ipRateLimitKey(req.ip),
    limit: DELETE_PER_IP,
    scope: DELETE_IP,
  });
  const perUser = createRateLimit({
    ...limits,
    keyOf: (_req, res) => (res.locals as { session: { userId: string } }).session.userId,
    limit: DELETE_PER_USER,
    scope: DELETE_USER,
  });

  router.delete('/me', perIp, createRequireSession({ database, now }), perUser, async (_req, res) => {
    const {
      logger,
      session: { userId },
    } = res.locals as { logger?: Logger; session: { userId: string } };
    let deleted: boolean;
    try {
      deleted = await withTransaction(database, (client) =>
        deleteUser(client, {
          rateLimitKeySecret,
          scrubMaxBytes: deletionScrubMaxBytes,
          scrubMaxRows: deletionScrubMaxRows,
          statementTimeoutMs: deletionStatementTimeoutMs,
          userId,
        }),
      );
    } catch (error) {
      if (!(error instanceof DeletionTooLargeError)) {
        throw error;
      }
      const { requestId } = res.locals as { requestId: string };
      res
        .status(HTTP.STATUS.SERVICE_UNAVAILABLE)
        .json(createErrorResponse(ERROR_CODES.SERVER.BUSY, 'Account deletion is busy, try again later', requestId));
      return;
    }
    if (deleted) {
      logger?.info({ event: 'account_deleted' }, 'account deleted');
    }
    res.clearCookie(COOKIE_NAME, sessionCookieOptions(isCookieSecure));
    res.status(HTTP.STATUS.NO_CONTENT).end();
  });

  return router;
}

export { createDeleteMeRouter };
