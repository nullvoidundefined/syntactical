// POST /v1/auth/signups and /v1/auth/signups/verify (B-72 to B-75, B-83): sign up with an email
// and a secret, proven by a one-time code.
//
// Start: the secret's policy and breach check run before any email, and nothing derived from
// it is stored. The answer is the same for a new, a code-only, and a with-secret email, so it
// never says whether an account exists. It shares the code-issue rate limits with POST /codes.
//
// Verify: input and policy first (no derivation, code untouched); an email with no live code
// gets the bad-code answer before any derivation; then the breach check; then the hash inside a
// slot, holding no pooled client; and only then, in one transaction, the code is consumed, the
// user upserted, the hash set if the user has none, and the session inserted.
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import type { z } from 'zod';

import { withTransaction } from '../clients/withTransaction.js';
import { AUTH } from '../constants/auth.js';
import { HTTP } from '../constants/http.js';
import { createErrorResponse, ERROR_CODES } from '../errors.js';
import type { ErrorCode } from '../errors.js';
import { createRateLimit } from '../middleware/rateLimit.js';
import { authSchemas } from '../schemas/authSchemas.js';
import { checkPasswordBreach } from '../services/checkPasswordBreach.js';
import { checkPasswordPolicy } from '../services/checkPasswordPolicy.js';
import { createUserWithPassword } from '../services/createUserWithPassword.js';
import { insertSession } from '../services/insertSession.js';
import { issueOneTimeCode } from '../services/issueOneTimeCode.js';
import { hashPassword } from '../services/passwordHash.js';
import { HashSlotsBusy } from '../services/passwordHashSlots.js';
import { verifyOneTimeCode } from '../services/verifyOneTimeCode.js';

import type { SignUpAuthDeps } from './authDeps.js';
import { sendSessionResponse } from './sendSessionResponse.js';

const {
  CODE: { MAX_ATTEMPTS },
  RATE_LIMIT: { ISSUE_PER_EMAIL, ISSUE_PER_IP, VERIFY_PER_EMAIL, VERIFY_PER_IP, WINDOW_MS },
  RATE_LIMIT_SCOPE: { ISSUE_EMAIL, ISSUE_IP, VERIFY_EMAIL, VERIFY_IP },
} = AUTH;
const {
  STATUS: { ACCEPTED, BAD_REQUEST, SERVICE_UNAVAILABLE },
} = HTTP;

const POLICY_MESSAGES: Record<string, string> = {
  [ERROR_CODES.AUTH.PASSWORD_TOO_LONG]: 'Password is too long',
  [ERROR_CODES.AUTH.PASSWORD_TOO_SHORT]: 'Password is too short',
  [ERROR_CODES.INPUT.INVALID_BODY]: 'Invalid request body',
};

// The parsed body, kept whole in res.locals. On the start route code and timezone are absent.
type SignUpBody = z.infer<typeof authSchemas.startSignUp> & Partial<z.infer<typeof authSchemas.verifySignUp>>;

function sendError(res: Response, status: number, code: ErrorCode, message: string): void {
  const { requestId } = res.locals as { requestId: string };
  res.status(status).json(createErrorResponse(code, message, requestId));
}

function sendInvalidCode(res: Response): void {
  sendError(res, BAD_REQUEST, ERROR_CODES.AUTH.INVALID_CODE, 'Invalid or expired code');
}

function createValidator(schema: typeof authSchemas.startSignUp | typeof authSchemas.verifySignUp) {
  return function validateSignUp(req: Request, res: Response, next: NextFunction): void {
    const { data, success } = schema.safeParse(req.body);
    if (!success) {
      sendError(res, BAD_REQUEST, ERROR_CODES.INPUT.INVALID_BODY, 'Invalid request body');
      return;
    }
    res.locals.email = data.email;
    res.locals.signUp = data;
    next();
  };
}

function createAuthSignupsRouter(deps: SignUpAuthDeps, logger: Logger): Router {
  const {
    database,
    deriveKey,
    emailClient,
    isCookieSecure,
    now,
    passwordBreachClient,
    passwordHashSlots,
    randomInt,
    rateLimitKeySecret,
  } = deps;
  const router = Router();
  const limits = { database, keySecret: rateLimitKeySecret, now, windowMs: WINDOW_MS };
  const keyOfEmail = (_req: Request, res: Response): string => String(res.locals.email);
  const keyOfIp = (req: Request): string => req.ip ?? 'unknown';
  const issuePerIp = createRateLimit({ ...limits, keyOf: keyOfIp, limit: ISSUE_PER_IP, scope: ISSUE_IP });
  const issuePerEmail = createRateLimit({ ...limits, keyOf: keyOfEmail, limit: ISSUE_PER_EMAIL, scope: ISSUE_EMAIL });
  const verifyPerIp = createRateLimit({ ...limits, keyOf: keyOfIp, limit: VERIFY_PER_IP, scope: VERIFY_IP });
  const verifyPerEmail = createRateLimit({
    ...limits,
    keyOf: keyOfEmail,
    limit: VERIFY_PER_EMAIL,
    scope: VERIFY_EMAIL,
  });

  function readLogger(res: Response): Logger {
    return (res.locals as { logger?: Logger }).logger ?? logger;
  }

  // Resolves the NFKC form, or sends the policy error and resolves undefined.
  function acceptPolicy(res: Response, raw: string): string | undefined {
    const policy = checkPasswordPolicy(raw);
    if (!policy.isOk) {
      sendError(res, BAD_REQUEST, policy.code, POLICY_MESSAGES[policy.code] ?? 'Invalid password');
      return undefined;
    }
    return policy.normalized;
  }

  // Sends the breach error and resolves false when the secret is known to be breached.
  async function acceptBreachCheck(res: Response, normalized: string): Promise<boolean> {
    const status = await checkPasswordBreach(normalized, { client: passwordBreachClient, logger: readLogger(res) });
    if (status === 'breached') {
      sendError(res, BAD_REQUEST, ERROR_CODES.AUTH.PASSWORD_BREACHED, 'Password appears in a known data breach');
      return false;
    }
    return true;
  }

  async function hasLiveCode(email: string, at: Date): Promise<boolean> {
    const { rowCount } = await database.query(
      `SELECT 1 FROM one_time_codes
       WHERE email = $1 AND used_at IS NULL AND invalidated_at IS NULL AND expires_at > $2 AND attempts < $3
       LIMIT 1`,
      [email, at, MAX_ATTEMPTS],
    );
    return rowCount === 1;
  }

  router.post('/signups', issuePerIp, createValidator(authSchemas.startSignUp), issuePerEmail, async (_req, res) => {
    const { email, ...secret } = (res.locals as { signUp: SignUpBody }).signUp;
    const normalized = acceptPolicy(res, secret.password);
    if (normalized === undefined || !(await acceptBreachCheck(res, normalized))) {
      return;
    }
    const isSent = await issueOneTimeCode({
      database,
      email,
      now: now(),
      randomInt,
      sendSignInCode: (to, code) => emailClient.sendSignInCode(to, code),
    });
    if (!isSent) {
      readLogger(res).warn({ event: 'sign_in_code_unsent' }, 'sign-in code not sent');
      sendError(
        res,
        SERVICE_UNAVAILABLE,
        ERROR_CODES.SERVER.EMAIL_UNAVAILABLE,
        'Email is unavailable, try again later',
      );
      return;
    }
    res.status(ACCEPTED).json({ data: { status: 'code-sent' } });
  });

  router.post(
    '/signups/verify',
    verifyPerIp,
    createValidator(authSchemas.verifySignUp),
    verifyPerEmail,
    async (req, res) => {
      const { code = '', email, timezone, ...secret } = (res.locals as { signUp: SignUpBody }).signUp;
      const normalized = acceptPolicy(res, secret.password);
      if (normalized === undefined) {
        return;
      }
      const at = now();
      if (!(await hasLiveCode(email, at))) {
        sendInvalidCode(res);
        return;
      }
      if (!(await acceptBreachCheck(res, normalized))) {
        return;
      }
      let passwordHash: string;
      try {
        passwordHash = await passwordHashSlots.run(() => hashPassword(normalized, deriveKey ? { deriveKey } : {}));
      } catch (error) {
        if (error instanceof HashSlotsBusy) {
          sendError(res, SERVICE_UNAVAILABLE, ERROR_CODES.SERVER.BUSY, 'Server busy, retry shortly');
          return;
        }
        throw error;
      }
      const outcome = await withTransaction(database, async (client) => {
        if (!(await verifyOneTimeCode(client, { code, email, now: at }))) {
          return undefined;
        }
        const user = await createUserWithPassword(client, { email, now: at, passwordHash, timezone });
        const { sessionToken } = await insertSession(client, { authMethod: 'code', now: at, userId: user.userId });
        return { ...user, sessionToken };
      });
      if (!outcome) {
        sendInvalidCode(res);
        return;
      }
      const { isPasswordApplied, sessionToken, userId } = outcome;
      sendSessionResponse(req, res, { extra: { isPasswordApplied }, isCookieSecure, sessionToken, userId });
    },
  );

  return router;
}

export { createAuthSignupsRouter };
