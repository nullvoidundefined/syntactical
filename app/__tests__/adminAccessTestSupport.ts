// Shared values for the admin access tests (IAN-601): the routes the app calls, the paid products
// the bundled manifest names, and the replies of GET me, GET admin/access, and PUT admin/access
// as the server slice (PR #110) sends them. Request ids and identities are built at run time.
import { randomBytes } from 'node:crypto';

import type { FakeReply } from '../../state/__tests__/authTestSupport';

export const PROFILE_ROUTE = 'GET me';
export const ACCESS_ROUTE = 'GET admin/access';
export const ACCESS_UPDATE_ROUTE = 'PUT admin/access';
export const ACCESS_PATH = 'admin/access';

export const PYTHON_MEDIUM = 'syntactical.python.medium';
export const POSTGRES_HARD = 'syntactical.postgres.hard';
export const JAVASCRIPT_MEDIUM = 'syntactical.javascript.medium';

// Accessible names start with the bank's language label and difficulty from the manifest.
export const PYTHON_MEDIUM_NAME = /^python medium\b/i;
export const POSTGRES_HARD_NAME = /^postgres hard\b/i;
export const JAVASCRIPT_MEDIUM_NAME = /^javascript medium\b/i;

export const NOT_AVAILABLE_TEXT = /not (available|found)/i;
export const PURCHASED_TEXT = /purchased/i;

export type GrantSource = 'admin' | 'purchase' | null;
export type ProductEntry = { grantSource: GrantSource; isGranted: boolean; productId: string };

export function buildEntry(productId: string, grantSource: GrantSource): ProductEntry {
  return { grantSource, isGranted: grantSource !== null, productId };
}

// GET me with the account facts, entitlements, and (when given) isAdmin.
export function meReply(email: string, options: { entitlements?: string[]; isAdmin?: boolean } = {}): FakeReply {
  const { entitlements = [], isAdmin } = options;
  const data: Record<string, unknown> = {
    dailyGoal: 20,
    dayStreak: 0,
    email,
    entitlements,
    hasPassword: true,
    timezone: 'UTC',
    xpToday: 0,
  };
  if (isAdmin !== undefined) data.isAdmin = isAdmin;
  return { status: 200, body: { data } };
}

export function accessReply(products: ProductEntry[]): FakeReply {
  return { status: 200, body: { data: { products } } };
}

export function entryReply(entry: ProductEntry): FakeReply {
  return { status: 200, body: { data: entry } };
}

export type BuiltError = { code: string; message: string; reply: FakeReply; requestId: string };

// An error envelope whose code, message, and request id must never reach the screen.
export function buildErrorReply(status: number, code: string, message: string): BuiltError {
  const requestId = `req-${randomBytes(6).toString('hex')}`;
  return { code, message, reply: { status, body: { error: { code, message, requestId } } }, requestId };
}

// The three products most tests list: one not granted, one admin-granted, one purchased.
export function mixedProducts(): ProductEntry[] {
  return [
    buildEntry(PYTHON_MEDIUM, null),
    buildEntry(POSTGRES_HARD, 'admin'),
    buildEntry(JAVASCRIPT_MEDIUM, 'purchase'),
  ];
}

// GET admin/access carrying whatever products value a test gives, well-formed or not.
export function rawAccessReply(products: unknown): FakeReply {
  return { status: 200, body: { data: { products } } };
}

// A 201 sign-in reply carrying a session value and user id, as POST auth/sessions/password sends it.
export function sessionReply(identity: { sessionValue: string; userId: string }): FakeReply {
  return { status: 201, body: { data: { token: identity.sessionValue, userId: identity.userId } } };
}
