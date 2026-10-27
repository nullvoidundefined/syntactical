// Shared values for the admin access tests: the routes the app calls, the one Pro entry GET and PUT
// admin/access answer with, and GET me with its pro object. Request ids and identities are built at
// run time.
import { randomBytes } from 'node:crypto';

import type { FakeReply } from '../../state/__tests__/authTestSupport';

export const PROFILE_ROUTE = 'GET me';
export const ACCESS_ROUTE = 'GET admin/access';
export const ACCESS_UPDATE_ROUTE = 'PUT admin/access';
export const ACCESS_PATH = 'admin/access';

// The admin grant is a lifetime row with no expiry (server, area 3, Task 3.9).
export const PRO_LIFETIME = 'syntactical.pro.lifetime';

export const ADMIN_GRANT_NAME = /^Pro \(admin grant\)$/;
export const PURCHASED_NAME = /^Pro \(purchased\)$/;
export const NOT_AVAILABLE_TEXT = /not (available|found)/i;

export type GrantSource = 'admin' | 'purchase' | null;
export type ProEntry = { grantSource: GrantSource; isGranted: boolean; productId: string };

export function buildEntry(grantSource: GrantSource): ProEntry {
  return { grantSource, isGranted: grantSource !== null, productId: PRO_LIFETIME };
}

// GET me with the account facts, the pro object, and (when given) isAdmin.
export function meReply(email: string, options: { isAdmin?: boolean; isPro?: boolean } = {}): FakeReply {
  const { isAdmin, isPro = false } = options;
  const data: Record<string, unknown> = {
    dailyGoal: 20,
    dayStreak: 0,
    email,
    hasPassword: true,
    pro: isPro
      ? { expiresAt: null, isActive: true, product: 'lifetime' }
      : { expiresAt: null, isActive: false, product: null },
    timezone: 'UTC',
    xpToday: 0,
  };
  if (isAdmin !== undefined) data.isAdmin = isAdmin;
  return { status: 200, body: { data } };
}

// GET admin/access and PUT admin/access both answer with the one entry.
export function entryReply(entry: ProEntry): FakeReply {
  return { status: 200, body: { data: entry } };
}

// An admin/access reply carrying whatever data a test gives, well-formed or not.
export function rawEntryReply(data: unknown): FakeReply {
  return { status: 200, body: { data } };
}

export type BuiltError = { code: string; message: string; reply: FakeReply; requestId: string };

// An error envelope whose code, message, and request id must never reach the screen.
export function buildErrorReply(status: number, code: string, message: string): BuiltError {
  const requestId = `req-${randomBytes(6).toString('hex')}`;
  return { code, message, reply: { status, body: { error: { code, message, requestId } } }, requestId };
}

// A 201 sign-in reply carrying a session value and user id, as POST auth/sessions/password sends it.
export function sessionReply(identity: { sessionValue: string; userId: string }): FakeReply {
  return { status: 201, body: { data: { token: identity.sessionValue, userId: identity.userId } } };
}
