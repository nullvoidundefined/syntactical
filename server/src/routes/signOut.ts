// DELETE /v1/auth/sessions/current (B-31): revokes the caller's session (cookie or bearer) and
// clears the cookie with the attributes it was set with. Only that session ends; the user's
// other devices stay signed in. The revoked token then gets 401 from requireSession.
import { Router } from 'express';

import { sessionCookieOptions } from '../config/sessionCookieOptions.js';
import { AUTH } from '../constants/auth.js';
import { HTTP } from '../constants/http.js';
import { createRequireSession } from '../middleware/requireSession.js';

import type { ResolvedAuthDeps } from './authDeps.js';

const {
  SESSION: { COOKIE_NAME },
} = AUTH;

function createSignOutRouter(deps: ResolvedAuthDeps): Router {
  const { database, isCookieSecure, now } = deps;
  const router = Router();

  router.delete('/sessions/current', createRequireSession({ database, now }), async (_req, res) => {
    const {
      session: { id, transport },
    } = res.locals as { session: { id: string; transport: string } };
    await database.query('UPDATE sessions SET revoked_at = $2 WHERE id = $1', [id, now()]);
    if (transport === 'cookie') {
      res.clearCookie(COOKIE_NAME, sessionCookieOptions(isCookieSecure));
    }
    res.status(HTTP.STATUS.NO_CONTENT).end();
  });

  return router;
}

export { createSignOutRouter };
