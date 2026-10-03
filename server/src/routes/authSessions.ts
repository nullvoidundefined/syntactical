// POST /v1/auth/sessions (B-27, B-28): exchanges an email and a one-time code for a session.
// Rate limited per client IP and per normalized email like issuing. The code check and the
// session insert share one transaction, so a code yields at most one session. A web client
// gets the token only as an HttpOnly cookie; a native client (X-Client: native) gets it in the
// body and no cookie. Every unusable code gets the same 400 body.
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

import { withTransaction } from '../clients/withTransaction.js';
import { sessionCookieOptions } from '../config/sessionCookieOptions.js';
import { AUTH } from '../constants/auth.js';
import { HTTP } from '../constants/http.js';
import { createErrorResponse, ERROR_CODES } from '../errors.js';
import { createRateLimit } from '../middleware/rateLimit.js';
import { authSchemas } from '../schemas/authSchemas.js';
import { createSession } from '../services/createSession.js';
import { ipRateLimitKey } from '../services/ipRateLimitKey.js';
import { verifyOneTimeCode } from '../services/verifyOneTimeCode.js';

import type { ResolvedAuthDeps } from './authDeps.js';

const {
  RATE_LIMIT: { VERIFY_PER_EMAIL, VERIFY_PER_IP, WINDOW_MS },
  RATE_LIMIT_SCOPE: { VERIFY_EMAIL, VERIFY_IP },
  SESSION: { ABSOLUTE_TTL_MS, COOKIE_NAME },
} = AUTH;
const {
  STATUS: { BAD_REQUEST, CREATED },
} = HTTP;
const NATIVE_CLIENT = 'native';
const TOKEN_FIELD = 'token';

interface SignInRequest {
  code: string;
  email: string;
  timezone: string | undefined;
}

function validateCreateSession(req: Request, res: Response, next: NextFunction): void {
  const { data, success } = authSchemas.createSession.safeParse(req.body);
  if (!success) {
    const { requestId } = res.locals as { requestId: string };
    res.status(BAD_REQUEST).json(createErrorResponse(ERROR_CODES.INPUT.INVALID_BODY, 'Invalid request body', requestId));
    return;
  }
  const { code, email, timezone } = data;
  res.locals.email = email;
  res.locals.signIn = { code, email, timezone } satisfies SignInRequest;
  next();
}

function createAuthSessionsRouter(deps: ResolvedAuthDeps): Router {
  const { database, isCookieSecure, now, rateLimitKeySecret } = deps;
  const router = Router();
  const limits = { database, keySecret: rateLimitKeySecret, now, windowMs: WINDOW_MS };
  const perIp = createRateLimit({
    ...limits,
    keyOf: (req) => ipRateLimitKey(req.ip),
    limit: VERIFY_PER_IP,
    scope: VERIFY_IP,
  });
  const perEmail = createRateLimit({
    ...limits,
    keyOf: (_req, res) => String(res.locals.email),
    limit: VERIFY_PER_EMAIL,
    scope: VERIFY_EMAIL,
  });

  router.post('/sessions', perIp, validateCreateSession, perEmail, async (req, res) => {
    const { requestId, signIn } = res.locals as { requestId: string; signIn: SignInRequest };
    const { code, email, timezone } = signIn;
    const at = now();
    const session = await withTransaction(database, async (client) => {
      const isValid = await verifyOneTimeCode(client, { code, email, now: at });
      return isValid ? createSession(client, { email, now: at, timezone }) : undefined;
    });
    if (!session) {
      res
        .status(BAD_REQUEST)
        .json(createErrorResponse(ERROR_CODES.AUTH.INVALID_CODE, 'Invalid or expired code', requestId));
      return;
    }
    const { sessionToken, userId } = session;
    if (req.get('X-Client') === NATIVE_CLIENT) {
      res.status(CREATED).json({ data: { [TOKEN_FIELD]: sessionToken, userId } });
      return;
    }
    res.cookie(COOKIE_NAME, sessionToken, { ...sessionCookieOptions(isCookieSecure), maxAge: ABSOLUTE_TTL_MS });
    res.status(CREATED).json({ data: { userId } });
  });

  return router;
}

export { createAuthSessionsRouter };
