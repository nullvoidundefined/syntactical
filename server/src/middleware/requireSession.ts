// requireSession (B-29), shaped after the template's requireAuth: reads an Authorization: Bearer
// token (native clients) or the syntactical_session cookie (web), hashes it with SHA-256, and
// accepts it only when its session is unrevoked, under its 30-day absolute expiry, and used
// within the last 14 days. One UPDATE checks all of that and moves last_used_at to now. When an
// Authorization header is present it alone decides, so a bad bearer token never falls back to
// a cookie. Every failure gets the same 401. The session lands in res.locals.session.
import type { NextFunction, Request, Response } from 'express';

import type { Database } from '../clients/database.js';
import { AUTH } from '../constants/auth.js';
import { HTTP } from '../constants/http.js';
import { createErrorResponse, ERROR_CODES } from '../errors.js';
import { sha256 } from '../services/sha256.js';

const {
  SESSION: { COOKIE_NAME, IDLE_TTL_MS },
} = AUTH;
const BEARER_PATTERN = /^Bearer ([A-Za-z0-9_-]+)$/;

interface RequireSessionOptions {
  database: Database;
  now: () => Date;
}

interface PresentedToken {
  transport: 'bearer' | 'cookie';
  value: string | undefined;
}

function presentedToken(req: Request): PresentedToken {
  const { cookies, headers } = req;
  const { authorization } = headers;
  if (authorization !== undefined) {
    const [, value] = BEARER_PATTERN.exec(authorization) ?? [];
    return { transport: 'bearer', value };
  }
  const { [COOKIE_NAME]: cookie } = (cookies ?? {}) as Record<string, unknown>;
  return { transport: 'cookie', value: typeof cookie === 'string' && cookie.length > 0 ? cookie : undefined };
}

function createRequireSession(options: RequireSessionOptions) {
  const { database, now } = options;
  return async function requireSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { transport, value } = presentedToken(req);
    if (value !== undefined) {
      const at = now();
      const { rows } = await database.query<{ id: string; user_id: string }>(
        `UPDATE sessions SET last_used_at = $2
         WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2 AND last_used_at > $3
         RETURNING id, user_id`,
        [sha256(value), at, new Date(at.getTime() - IDLE_TTL_MS)],
      );
      const [row] = rows;
      if (row) {
        const { id, user_id: userId } = row;
        res.locals.session = { id, transport, userId };
        next();
        return;
      }
    }
    const { requestId } = res.locals as { requestId: string };
    res
      .status(HTTP.STATUS.UNAUTHORIZED)
      .json(createErrorResponse(ERROR_CODES.AUTH.SESSION_REQUIRED, 'Sign-in required', requestId));
  };
}

export { createRequireSession };
