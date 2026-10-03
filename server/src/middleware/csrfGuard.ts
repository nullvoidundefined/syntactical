// CSRF guard (B-63), ported from the template's csrfGuardMiddleware: a state-changing request
// (POST, PUT, PATCH, DELETE) that carries the session cookie must also carry
// X-Requested-With: XMLHttpRequest. A cross-site page cannot add that header without a CORS
// preflight, which the exact-origin allowlist refuses. A request with an Authorization header
// is exempt: requireSession then authenticates by the bearer token alone, never the cookie.
// The webhook routes are exempt; they carry no cookie and authenticate by their own header.
import type { NextFunction, Request, Response } from 'express';

import { AUTH } from '../constants/auth.js';
import { HTTP } from '../constants/http.js';
import { createErrorResponse, ERROR_CODES } from '../errors.js';

const STATE_CHANGING_METHODS = new Set(['DELETE', 'PATCH', 'POST', 'PUT']);
const WEBHOOK_PATH_PREFIX = '/v1/webhooks/';
const REQUIRED_VALUE = 'XMLHttpRequest';
const {
  SESSION: { COOKIE_NAME },
} = AUTH;

function isCookieAuthenticated(req: Request): boolean {
  const { cookies, headers } = req;
  const { [COOKIE_NAME]: cookie } = (cookies ?? {}) as Record<string, unknown>;
  return cookie !== undefined && headers.authorization === undefined;
}

function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  const { method, path } = req;
  if (!STATE_CHANGING_METHODS.has(method) || path.startsWith(WEBHOOK_PATH_PREFIX) || !isCookieAuthenticated(req)) {
    next();
    return;
  }
  if (req.get('X-Requested-With') !== REQUIRED_VALUE) {
    const { requestId } = res.locals as { requestId: string };
    res
      .status(HTTP.STATUS.FORBIDDEN)
      .json(createErrorResponse(ERROR_CODES.CSRF.HEADER_MISSING, 'Missing X-Requested-With header', requestId));
    return;
  }
  next();
}

export { csrfGuard };
