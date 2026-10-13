// GET /v1/me and PATCH /v1/me (B-35): the signed-in user's profile with progress computed from
// stored data, and changes to the timezone and the daily goal. Both need a session; PATCH is
// rate limited per user and refuses an unknown zone, a goal outside 10, 20, and 50, unknown
// fields, or an empty body with 400. Both answer with the profile.
import { Router } from 'express';

import { HTTP } from '../constants/http.js';
import { SYNC } from '../constants/sync.js';
import { ERROR_CODES, sendError } from '../errors.js';
import { createRateLimit } from '../middleware/rateLimit.js';
import { keyOfUser } from '../middleware/rateLimitKeys.js';
import { createRequireSession } from '../middleware/requireSession.js';
import { meSchemas } from '../schemas/meSchemas.js';
import { readProfile } from '../services/readProfile.js';
import { updateProfile } from '../services/updateProfile.js';

import type { ResolvedSyncDeps } from './syncDeps.js';

const {
  STATUS: { BAD_REQUEST, OK, UNAUTHORIZED },
} = HTTP;

function createMeRouter(deps: ResolvedSyncDeps): Router {
  const { database, now, rateLimitKeySecret } = deps;
  const router = Router();
  const requireSession = createRequireSession({ database, now });
  const perUser = createRateLimit({
    database,
    keyOf: keyOfUser,
    keySecret: rateLimitKeySecret,
    limit: SYNC.RATE_LIMIT.PROFILE_UPDATE_PER_USER,
    now,
    scope: SYNC.RATE_LIMIT_SCOPE.PROFILE_UPDATE,
    windowMs: SYNC.RATE_LIMIT.WINDOW_MS,
  });

  router.get('/me', requireSession, async (_req, res) => {
    const { session } = res.locals as { session: { userId: string } };
    const profile = await readProfile(database, session.userId, now());
    if (!profile) {
      sendError(res, UNAUTHORIZED, ERROR_CODES.AUTH.SESSION_REQUIRED, 'Sign-in required');
      return;
    }
    res.status(OK).json({ data: profile });
  });

  router.patch('/me', requireSession, perUser, async (req, res) => {
    const { session } = res.locals as { session: { userId: string } };
    const { data, success } = meSchemas.update.safeParse(req.body);
    if (!success) {
      sendError(res, BAD_REQUEST, ERROR_CODES.INPUT.INVALID_BODY, 'Invalid request body');
      return;
    }
    const result = await updateProfile(database, session.userId, data, now());
    if (result.kind !== 'updated') {
      sendError(res, UNAUTHORIZED, ERROR_CODES.AUTH.SESSION_REQUIRED, 'Sign-in required');
      return;
    }
    const { profile } = result;
    res.status(OK).json({ data: profile });
  });

  return router;
}

export { createMeRouter };
