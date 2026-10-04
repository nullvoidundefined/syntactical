// POST /v1/auth/codes (B-25, B-26): emails a one-time sign-in code. Rate limited per client IP
// before the body is read and per normalized email after it; the response is the same for an
// existing and a new email, and never says whether an account exists.
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';

import { AUTH } from '../constants/auth.js';
import { HTTP } from '../constants/http.js';
import { createErrorResponse, ERROR_CODES } from '../errors.js';
import { createRateLimit } from '../middleware/rateLimit.js';
import { authSchemas } from '../schemas/authSchemas.js';
import { issueOneTimeCode } from '../services/issueOneTimeCode.js';

import type { ResolvedAuthDeps } from './authDeps.js';

const {
  RATE_LIMIT: { ISSUE_PER_EMAIL, ISSUE_PER_IP, WINDOW_MS },
  RATE_LIMIT_SCOPE: { ISSUE_EMAIL, ISSUE_IP },
} = AUTH;
const {
  STATUS: { ACCEPTED, BAD_REQUEST, SERVICE_UNAVAILABLE },
} = HTTP;

function validateIssueCode(req: Request, res: Response, next: NextFunction): void {
  const { data, success } = authSchemas.issueCode.safeParse(req.body);
  if (!success) {
    const { requestId } = res.locals as { requestId: string };
    res.status(BAD_REQUEST).json(createErrorResponse(ERROR_CODES.INPUT.INVALID_BODY, 'Invalid request body', requestId));
    return;
  }
  res.locals.email = data.email;
  next();
}

function createAuthCodesRouter(deps: ResolvedAuthDeps, logger: Logger): Router {
  const { database, emailClient, now, randomInt, rateLimitKeySecret } = deps;
  const router = Router();
  const limits = { database, keySecret: rateLimitKeySecret, now, windowMs: WINDOW_MS };
  const perIp = createRateLimit({
    ...limits,
    keyOf: (req) => req.ip ?? 'unknown',
    limit: ISSUE_PER_IP,
    scope: ISSUE_IP,
  });
  const perEmail = createRateLimit({
    ...limits,
    keyOf: (_req, res) => String(res.locals.email),
    limit: ISSUE_PER_EMAIL,
    scope: ISSUE_EMAIL,
  });

  router.post('/codes', perIp, validateIssueCode, perEmail, async (_req, res) => {
    const { email, logger: requestLogger, requestId } = res.locals as {
      email: string;
      logger?: Logger;
      requestId: string;
    };
    const isSent = await issueOneTimeCode({
      database,
      email,
      now: now(),
      randomInt,
      sendSignInCode: (to, code) => emailClient.sendSignInCode(to, code),
    });
    if (!isSent) {
      (requestLogger ?? logger).warn({ event: 'sign_in_code_unsent' }, 'sign-in code not sent');
      res
        .status(SERVICE_UNAVAILABLE)
        .json(createErrorResponse(ERROR_CODES.SERVER.EMAIL_UNAVAILABLE, 'Email is unavailable, try again later', requestId));
      return;
    }
    res.status(ACCEPTED).json({ data: { status: 'code-sent' } });
  });

  return router;
}

export { createAuthCodesRouter };
