// POST /v1/auth/sessions (B-27, B-28): exchanges an email and a one-time code for a session.
// Rate limited per client IP and per normalized email like issuing. The code check and the
// session insert share one transaction, so a code yields at most one session. A web client
// gets the token only as an HttpOnly cookie; a native client (X-Client: native) gets it in the
// body and no cookie. Every unusable code gets the same 400 body.
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

import { withTransaction } from '../clients/withTransaction.js';
import { AUTH } from '../constants/auth.js';
import { HTTP } from '../constants/http.js';
import { ERROR_CODES, sendError } from '../errors.js';
import { createRateLimit } from '../middleware/rateLimit.js';
import { keyOfEmail, keyOfIp } from '../middleware/rateLimitKeys.js';
import { authSchemas } from '../schemas/authSchemas.js';
import { createSession } from '../services/createSession.js';
import { verifyOneTimeCode } from '../services/verifyOneTimeCode.js';

import type { ResolvedAuthDeps } from './authDeps.js';
import { sendSessionResponse } from './sendSessionResponse.js';

const {
  RATE_LIMIT: { VERIFY_PER_EMAIL, VERIFY_PER_IP, WINDOW_MS },
  RATE_LIMIT_SCOPE: { VERIFY_EMAIL, VERIFY_IP },
} = AUTH;
const {
  STATUS: { BAD_REQUEST },
} = HTTP;

interface SignInRequest {
  code: string;
  email: string;
  timezone: string | undefined;
}

function validateCreateSession(req: Request, res: Response, next: NextFunction): void {
  const { data, success } = authSchemas.createSession.safeParse(req.body);
  if (!success) {
    sendError(res, BAD_REQUEST, ERROR_CODES.INPUT.INVALID_BODY, 'Invalid request body');
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
    keyOf: keyOfIp,
    limit: VERIFY_PER_IP,
    scope: VERIFY_IP,
  });
  const perEmail = createRateLimit({
    ...limits,
    keyOf: keyOfEmail,
    limit: VERIFY_PER_EMAIL,
    scope: VERIFY_EMAIL,
  });

  router.post('/sessions', perIp, validateCreateSession, perEmail, async (req, res) => {
    const { signIn } = res.locals as { signIn: SignInRequest };
    const { code, email, timezone } = signIn;
    const at = now();
    const session = await withTransaction(database, async (client) => {
      const isValid = await verifyOneTimeCode(client, { code, email, now: at });
      return isValid ? createSession(client, { email, now: at, timezone }) : undefined;
    });
    if (!session) {
      sendError(res, BAD_REQUEST, ERROR_CODES.AUTH.INVALID_CODE, 'Invalid or expired code');
      return;
    }
    sendSessionResponse(req, res, { ...session, isCookieSecure });
  });

  return router;
}

export { createAuthSessionsRouter };
