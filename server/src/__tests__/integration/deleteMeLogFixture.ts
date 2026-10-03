// Shared by the B-59.3 deletion-log tests: an auth test app whose logger is the production
// logger (real redaction config) writing to an in-memory destination, a seeded account with a
// session, and helpers to search the captured lines for the account's identity in any casing.
import { randomBytes } from 'node:crypto';

import type pg from 'pg';
import request from 'supertest';

import { createLogger } from '../../clients/logger.js';
import { AUTH } from '../../constants/auth.js';
import { createAuthTestApp } from './createAuthTestApp.js';
import { insertSession } from './insertSession.js';

const DELETE_ME_ROUTE = '/v1/me';
const COOKIE_NAME = AUTH.SESSION.COOKIE_NAME;
const HEX_BYTES = 6;

interface LoggedDeleteApp {
  app: ReturnType<typeof createAuthTestApp>['app'];
  clock: ReturnType<typeof createAuthTestApp>['clock'];
  lines: string[];
}

interface SeededAccount {
  email: string;
  sessionToken: string;
  userId: string;
}

function createLoggedDeleteApp(pool: pg.Pool): LoggedDeleteApp {
  const lines: string[] = [];
  const destination = {
    write(chunk: string): void {
      lines.push(...chunk.split('\n').filter((line) => line.length > 0));
    },
  };
  const { app, clock } = createAuthTestApp({ logger: createLogger({ destination }), pool });
  return { app, clock, lines };
}

// The stored email is mixed case so a lower-cased copy anywhere in a log line is still caught.
async function seedAccount(pool: pg.Pool, now: Date): Promise<SeededAccount> {
  const local = randomBytes(HEX_BYTES).toString('hex').toUpperCase();
  const email = `Learner-${local}@Example.COM`;
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO users (email, timezone) VALUES ($1, $2) RETURNING id',
    [email, 'Europe/London'],
  );
  const [{ id: userId }] = rows;
  const { sessionToken } = await insertSession(pool, { createdAt: now, userId });
  return { email, sessionToken, userId };
}

function deleteWithCookie(app: LoggedDeleteApp['app'], sessionToken: string) {
  return request(app)
    .delete(DELETE_ME_ROUTE)
    .set('Cookie', `${COOKIE_NAME}=${sessionToken}`)
    .set('X-Requested-With', 'XMLHttpRequest');
}

// Lines holding the email (any casing) or the user id (any casing).
function linesExposing(lines: string[], { email, userId }: { email: string; userId: string }): string[] {
  const needles = [email.toLowerCase(), userId.toLowerCase()];
  return lines.filter((line) => {
    const folded = line.toLowerCase();
    return needles.some((needle) => folded.includes(needle));
  });
}

function parsedLines(lines: string[]): Record<string, unknown>[] {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

export { createLoggedDeleteApp, deleteWithCookie, linesExposing, parsedLines, seedAccount };
export type { LoggedDeleteApp, SeededAccount };
