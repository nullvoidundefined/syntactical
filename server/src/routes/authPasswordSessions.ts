// POST /v1/auth/sessions/password (B-68, B-76, B-79, B-83, B-85): signs in with an email and a
// password. Limits run first, per client IP before the body is read and per normalized email
// after. Then the password's form is checked (no length policy, so any password that fits the
// raw cap is derived like a wrong one), then verifyUserPassword derives exactly once whatever the
// account is, holding no pooled client. Only then one transaction re-reads the user's hash and
// requires it to be the verified one, writes the rehash if there is one, fills an empty
// timezone, and inserts the session. Every failure to sign in is the same 400 body.
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

import { withTransaction } from '../clients/withTransaction.js';
import { AUTH } from '../constants/auth.js';
import { HTTP } from '../constants/http.js';
import { createErrorResponse, ERROR_CODES } from '../errors.js';
import type { ErrorCode } from '../errors.js';
import { createRateLimit } from '../middleware/rateLimit.js';
import { authSchemas } from '../schemas/authSchemas.js';
import { normalizePassword } from '../services/checkPasswordPolicy.js';
import { insertSession } from '../services/insertSession.js';
import { isValidTimeZone } from '../services/isValidTimeZone.js';
import { HashSlotsBusy } from '../services/passwordHashSlots.js';
import { verifyUserPassword } from '../services/verifyUserPassword.js';
import type { VerifiedUserPassword } from '../services/verifyUserPassword.js';

import type { PasswordSessionsAuthDeps } from './authDeps.js';
import { sendSessionResponse } from './sendSessionResponse.js';

const {
  RATE_LIMIT: { PASSWORD_SIGN_IN_PER_EMAIL, PASSWORD_SIGN_IN_PER_IP, WINDOW_MS },
  RATE_LIMIT_SCOPE: { PASSWORD_SIGN_IN_EMAIL, PASSWORD_SIGN_IN_IP },
} = AUTH;
const {
  STATUS: { BAD_REQUEST, SERVICE_UNAVAILABLE },
} = HTTP;

type SignInBody = z.infer<typeof authSchemas.passwordSignIn>;

function sendError(res: Response, status: number, code: ErrorCode, message: string): void {
  const { requestId } = res.locals as { requestId: string };
  res.status(status).json(createErrorResponse(code, message, requestId));
}

function sendInvalidCredentials(res: Response): void {
  sendError(res, BAD_REQUEST, ERROR_CODES.AUTH.INVALID_CREDENTIALS, 'Invalid email or password');
}

function validateSignIn(req: Request, res: Response, next: NextFunction): void {
  const { data, success } = authSchemas.passwordSignIn.safeParse(req.body);
  if (!success) {
    sendError(res, BAD_REQUEST, ERROR_CODES.INPUT.INVALID_BODY, 'Invalid request body');
    return;
  }
  res.locals.email = data.email;
  res.locals.signIn = data;
  next();
}

function createAuthPasswordSessionsRouter(deps: PasswordSessionsAuthDeps): Router {
  const { database, deriveKey, dummyPasswordHash, isCookieSecure, now, passwordHashSlots, rateLimitKeySecret } = deps;
  const router = Router();
  const limits = { database, keySecret: rateLimitKeySecret, now, windowMs: WINDOW_MS };
  const perIp = createRateLimit({
    ...limits,
    keyOf: (req) => req.ip ?? 'unknown',
    limit: PASSWORD_SIGN_IN_PER_IP,
    scope: PASSWORD_SIGN_IN_IP,
  });
  const perEmail = createRateLimit({
    ...limits,
    keyOf: (_req, res) => String(res.locals.email),
    limit: PASSWORD_SIGN_IN_PER_EMAIL,
    scope: PASSWORD_SIGN_IN_EMAIL,
  });

  // Resolves the session token, or undefined when the stored hash is no longer the verified one.
  async function openSession(verified: VerifiedUserPassword, timezone: string | undefined, at: Date) {
    const { rehash, userId, verifiedHash } = verified;
    return withTransaction(database, async (client) => {
      const { rows } = await client.query<{ password_hash: string | null }>(
        'SELECT password_hash FROM users WHERE id = $1 FOR UPDATE',
        [userId],
      );
      if (rows[0]?.password_hash !== verifiedHash) {
        return undefined;
      }
      if (rehash !== undefined) {
        await client.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, rehash]);
      }
      if (timezone !== undefined && isValidTimeZone(timezone)) {
        await client.query('UPDATE users SET timezone = $2 WHERE id = $1 AND timezone IS NULL', [userId, timezone]);
      }
      return insertSession(client, { authMethod: 'password', now: at, userId });
    });
  }

  router.post('/sessions/password', perIp, validateSignIn, perEmail, async (req, res) => {
    const { email, password, timezone } = (res.locals as { signIn: SignInBody }).signIn;
    const normalized = normalizePassword(password);
    if (!normalized.isOk) {
      sendError(res, BAD_REQUEST, normalized.code, 'Invalid request body');
      return;
    }
    let verified: VerifiedUserPassword | null;
    try {
      verified = await verifyUserPassword(database, {
        ...(deriveKey ? { deriveKey } : {}),
        dummyHash: dummyPasswordHash,
        email,
        normalizedPassword: normalized.normalized,
        slots: passwordHashSlots,
      });
    } catch (error) {
      if (error instanceof HashSlotsBusy) {
        sendError(res, SERVICE_UNAVAILABLE, ERROR_CODES.SERVER.BUSY, 'Server busy, retry shortly');
        return;
      }
      throw error;
    }
    if (!verified) {
      sendInvalidCredentials(res);
      return;
    }
    const opened = await openSession(verified, timezone, now());
    if (!opened) {
      sendInvalidCredentials(res);
      return;
    }
    sendSessionResponse(req, res, { isCookieSecure, sessionToken: opened.sessionToken, userId: verified.userId });
  });

  return router;
}

export { createAuthPasswordSessionsRouter };
