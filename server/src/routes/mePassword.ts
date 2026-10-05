// PUT /v1/me/password (B-80 to B-82, B-79, B-83, B-85): sets or changes the signed-in user's
// password. Needs a session (cookie requests also the CSRF header). Counted per user on every
// attempt, before the body is read. Then, with no derivation: the body's form, newPassword's
// length policy and breach check (newPassword only), and authorization. With currentPassword the
// user must have a hash and it must verify, inside a slot; without it the session must be a
// fresh code session (isFreshCodeSession), else 403. Then the new hash is derived inside a slot.
// Both waits hold no pooled client. Only then one transaction locks the user row, requires the
// stored hash to still be the one read before verifying, locks and re-checks that this session
// is still live (so two fresh code sessions cannot each change the password and revoke the
// other), stores the hash and password_updated_at, and revokes the user's other sessions.
// Nothing here logs or returns a password, its SHA-1 or prefix, or a hash.
import { Router } from 'express';
import type { Response } from 'express';
import type { Logger } from 'pino';

import { withTransaction } from '../clients/withTransaction.js';
import { AUTH } from '../constants/auth.js';
import { HTTP } from '../constants/http.js';
import { createErrorResponse, ERROR_CODES } from '../errors.js';
import type { ErrorCode } from '../errors.js';
import { createRateLimit } from '../middleware/rateLimit.js';
import { createRequireSession } from '../middleware/requireSession.js';
import { authSchemas } from '../schemas/authSchemas.js';
import { checkPasswordBreach } from '../services/checkPasswordBreach.js';
import { checkPasswordPolicy, normalizePassword } from '../services/checkPasswordPolicy.js';
import { isFreshCodeSession } from '../services/isFreshCodeSession.js';
import { hashPassword, isUsableHash, verifyPassword } from '../services/passwordHash.js';
import { HashSlotsBusy } from '../services/passwordHashSlots.js';

import type { SignUpAuthDeps } from './authDeps.js';

const {
  RATE_LIMIT: { PASSWORD_CHANGE_PER_USER, WINDOW_MS },
  RATE_LIMIT_SCOPE: { PASSWORD_CHANGE_USER },
} = AUTH;
const {
  STATUS: { BAD_REQUEST, FORBIDDEN, OK, SERVICE_UNAVAILABLE, UNAUTHORIZED },
} = HTTP;

const POLICY_MESSAGES: Record<string, string> = {
  [ERROR_CODES.AUTH.PASSWORD_TOO_LONG]: 'Password is too long',
  [ERROR_CODES.AUTH.PASSWORD_TOO_SHORT]: 'Password is too short',
  [ERROR_CODES.INPUT.INVALID_BODY]: 'Invalid request body',
};

interface SessionLocals {
  requestId: string;
  session: { id: string; userId: string };
}

function sendError(res: Response, status: number, code: ErrorCode, message: string): void {
  const { requestId } = res.locals as { requestId: string };
  res.status(status).json(createErrorResponse(code, message, requestId));
}

function createMePasswordRouter(deps: SignUpAuthDeps, logger: Logger): Router {
  const { database, deriveKey, now, passwordBreachClient, passwordHashSlots, rateLimitKeySecret } = deps;
  const router = Router();
  const hashDeps = deriveKey ? { deriveKey } : {};
  const requireSession = createRequireSession({ database, now });
  const perUser = createRateLimit({
    database,
    keyOf: (_req, res) => String((res.locals as SessionLocals).session.userId),
    keySecret: rateLimitKeySecret,
    limit: PASSWORD_CHANGE_PER_USER,
    now,
    scope: PASSWORD_CHANGE_USER,
    windowMs: WINDOW_MS,
  });

  async function readStoredHash(userId: string): Promise<{ hash: string | null } | undefined> {
    const { rows } = await database.query<{ password_hash: string | null }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId],
    );
    return rows[0] ? { hash: rows[0].password_hash } : undefined;
  }

  async function isSessionFresh(sessionId: string, at: Date): Promise<boolean> {
    const { rows } = await database.query<{ auth_method: 'code' | 'password'; created_at: Date }>(
      'SELECT auth_method, created_at FROM sessions WHERE id = $1',
      [sessionId],
    );
    const [row] = rows;
    return row !== undefined && isFreshCodeSession({ authMethod: row.auth_method, createdAt: row.created_at }, at);
  }

  router.put('/me/password', requireSession, perUser, async (req, res) => {
    const { session } = res.locals as SessionLocals;
    const { data, success } = authSchemas.changePassword.safeParse(req.body);
    if (!success) {
      sendError(res, BAD_REQUEST, ERROR_CODES.INPUT.INVALID_BODY, 'Invalid request body');
      return;
    }
    const { currentPassword, newPassword } = data;
    const normalizedCurrent = currentPassword === undefined ? undefined : normalizePassword(currentPassword);
    if (normalizedCurrent && !normalizedCurrent.isOk) {
      sendError(res, BAD_REQUEST, normalizedCurrent.code, 'Invalid request body');
      return;
    }
    const policy = checkPasswordPolicy(newPassword);
    if (!policy.isOk) {
      sendError(res, BAD_REQUEST, policy.code, POLICY_MESSAGES[policy.code] ?? 'Invalid password');
      return;
    }
    const breach = await checkPasswordBreach(policy.normalized, {
      client: passwordBreachClient,
      logger: (res.locals as { logger?: Logger }).logger ?? logger,
    });
    if (breach === 'breached') {
      sendError(res, BAD_REQUEST, ERROR_CODES.AUTH.PASSWORD_BREACHED, 'Password appears in a known data breach');
      return;
    }

    const at = now();
    const stored = await readStoredHash(session.userId);
    if (!stored) {
      sendError(res, UNAUTHORIZED, ERROR_CODES.AUTH.SESSION_REQUIRED, 'Sign-in required');
      return;
    }
    try {
      if (normalizedCurrent?.isOk) {
        const { hash } = stored;
        const isUsable = hash !== null && isUsableHash(hash);
        const isVerified =
          isUsable && (await passwordHashSlots.run(() => verifyPassword(normalizedCurrent.normalized, hash, hashDeps)));
        if (!isVerified) {
          sendError(res, BAD_REQUEST, ERROR_CODES.AUTH.INVALID_CREDENTIALS, 'Invalid current password');
          return;
        }
      } else if (!(await isSessionFresh(session.id, at))) {
        sendError(res, FORBIDDEN, ERROR_CODES.AUTH.REAUTH_REQUIRED, 'Sign in again with a code to set a password');
        return;
      }
      const newHash = await passwordHashSlots.run(() => hashPassword(policy.normalized, hashDeps));
      const outcome = await withTransaction(database, async (client) => {
        const { rows } = await client.query<{ password_hash: string | null }>(
          'SELECT password_hash FROM users WHERE id = $1 FOR UPDATE',
          [session.userId],
        );
        if (rows[0]?.password_hash !== stored.hash) {
          return 'changed' as const;
        }
        const live = await client.query(
          'SELECT 1 FROM sessions WHERE id = $1 AND revoked_at IS NULL AND expires_at > $2 FOR UPDATE',
          [session.id, at],
        );
        if (live.rowCount !== 1) {
          return 'session-gone' as const;
        }
        await client.query('UPDATE users SET password_hash = $2, password_updated_at = $3 WHERE id = $1', [
          session.userId,
          newHash,
          at,
        ]);
        await client.query(
          'UPDATE sessions SET revoked_at = $3 WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL',
          [session.userId, session.id, at],
        );
        return 'saved' as const;
      });
      if (outcome === 'changed') {
        sendError(res, BAD_REQUEST, ERROR_CODES.AUTH.INVALID_CREDENTIALS, 'Invalid current password');
        return;
      }
      if (outcome === 'session-gone') {
        sendError(res, UNAUTHORIZED, ERROR_CODES.AUTH.SESSION_REQUIRED, 'Sign-in required');
        return;
      }
      res.status(OK).json({ data: { hasPassword: true } });
    } catch (error) {
      if (error instanceof HashSlotsBusy) {
        sendError(res, SERVICE_UNAVAILABLE, ERROR_CODES.SERVER.BUSY, 'Server busy, retry shortly');
        return;
      }
      throw error;
    }
  });

  return router;
}

export { createMePasswordRouter };
