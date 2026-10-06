// Requests and database reads shared by the /v1/admin/access integration tests: sign in a user
// (an admin when the test sets users.is_admin directly, the only way the flag is ever set), call
// the admin routes by bearer token or by cookie, and read a user's entitlement rows.
import type pg from 'pg';
import request from 'supertest';

import { insertSession } from './insertSession.js';

export const ADMIN_ACCESS_ROUTE = '/v1/admin/access';
const COOKIE_NAME = 'syntactical_session';

export interface Caller {
  sessionToken: string;
  transport: 'bearer' | 'cookie';
  userId: string;
}

export interface EntitlementRow {
  product_id: string;
  source: string;
  status: string;
  updated_at: Date;
}

type App = Parameters<typeof request>[0];

export async function signInUser(pool: pg.Pool, now: Date, isAdmin: boolean): Promise<Caller> {
  const { sessionToken, userId } = await insertSession(pool, { createdAt: now });
  if (isAdmin) {
    await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [userId]);
  }
  return { sessionToken, transport: 'bearer', userId };
}

export function asCookie(caller: Caller): Caller {
  return { ...caller, transport: 'cookie' };
}

export function authorize(pending: request.Test, caller: Caller, withCsrfHeader = true): request.Test {
  if (caller.transport === 'bearer') {
    return pending.set('Authorization', `Bearer ${caller.sessionToken}`);
  }
  const withCookie = pending.set('Cookie', `${COOKIE_NAME}=${caller.sessionToken}`);
  return withCsrfHeader ? withCookie.set('X-Requested-With', 'XMLHttpRequest') : withCookie;
}

export function getAccess(app: App, caller: Caller): Promise<request.Response> {
  return authorize(request(app).get(ADMIN_ACCESS_ROUTE), caller).then((response) => response);
}

export function putAccess(app: App, caller: Caller, body: unknown): Promise<request.Response> {
  return authorize(request(app).put(ADMIN_ACCESS_ROUTE), caller)
    .send(body as object)
    .then((response) => response);
}

export async function readEntitlementRows(pool: pg.Pool, userId: string): Promise<EntitlementRow[]> {
  const { rows } = await pool.query<EntitlementRow>(
    'SELECT product_id, source, status, updated_at FROM entitlements WHERE user_id = $1 ORDER BY product_id',
    [userId],
  );
  return rows;
}

export async function insertEntitlement(
  pool: pg.Pool,
  row: { productId: string; source: string; status: 'granted' | 'revoked'; userId: string },
): Promise<void> {
  await pool.query('INSERT INTO entitlements (user_id, product_id, source, status) VALUES ($1, $2, $3, $4)', [
    row.userId,
    row.productId,
    row.source,
    row.status,
  ]);
}

export async function readIsAdmin(pool: pg.Pool, userId: string): Promise<boolean | undefined> {
  const { rows } = await pool.query<{ is_admin: boolean }>('SELECT is_admin FROM users WHERE id = $1', [userId]);
  return rows[0]?.is_admin;
}
