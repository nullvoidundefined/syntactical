// Shared values for the Settings password form tests (Task 7.9; B-88, B-89, B-90): the visible
// names the form uses, run-time passwords (no credential-shaped literal sits in source), and the
// API replies of PUT me/password, the inline code steps, and GET me.
import { randomBytes, randomInt } from 'node:crypto';

import type { FakeReply, SignInIdentity } from '../../../state/__tests__/authTestSupport';

export const PASSWORD_ROUTE = 'PUT me/password';
export const CODES_ROUTE = 'POST auth/codes';
export const SESSIONS_ROUTE = 'POST auth/sessions';
export const PROFILE_ROUTE = 'GET me';

export const ADD_HEADING = 'Add a password';
export const CHANGE_HEADING = 'Change password';
export const CURRENT_LABEL = 'Current password';
export const NEW_LABEL = 'New password';
export const SAVE_BUTTON = 'Save password';
export const USE_CODE_BUTTON = 'Use a code instead';
export const SEND_CODE_BUTTON = 'Send code';
export const CODE_LABEL = 'Sign-in code';
export const VERIFY_BUTTON = 'Verify code';
export const EMAIL_LABEL = 'Email address';

export const SAVED_MESSAGE = 'Password saved. Other devices were signed out.';
export const WRONG_CURRENT_MESSAGE = 'That current password is not right.';
export const TOO_SHORT_MESSAGE = /at least 12 characters/i;
export const TOO_LONG_MESSAGE = /128 characters/i;
export const BREACHED_MESSAGE = /data breach/i;
export const RATE_LIMITED_MESSAGE = /too many attempts/i;
export const BUSY_MESSAGE = /busy/i;
export const UNAVAILABLE_MESSAGE = /unavailable/i;

export function buildPassword(): string {
  return [randomBytes(6).toString('hex'), randomBytes(6).toString('base64url')].join(' ');
}

// A password of exactly `count` code points that is longer in UTF-16 units: characters outside
// the Basic Multilingual Plane, a space, and hex letters, all unchanged by NFKC.
export function buildPasswordOfLength(count: number): string {
  const astral = () => String.fromCodePoint(0x1f600 + randomInt(0, 0x40));
  const hex = () => randomBytes(1).toString('hex')[0];
  const parts = [hex(), astral(), ' ', astral(), astral()];
  while (parts.length < count - 1) parts.push(hex());
  parts.push(hex());
  const password = parts.slice(0, count).join('');
  if (Array.from(password.normalize('NFKC')).length !== count) throw new Error('length helper is wrong');
  return password;
}

// A 16-unit password with one lone high surrogate in the middle: malformed, since UTF-8 cannot
// carry it, though its length is in range.
export function buildLoneSurrogatePassword(): string {
  const lone = String.fromCharCode(0xd800 + randomInt(0, 0x400));
  return `${randomBytes(4).toString('hex')}${lone}${randomBytes(4).toString('hex')}`.slice(0, 16);
}

// Markup, quotes, and SQL-shaped text: a valid password that must travel unchanged and never render.
export function buildInjectionPassword(): string {
  return [`<script>${randomBytes(3).toString('hex')}</script>`, `' OR '1'='1' --`, randomBytes(3).toString('hex')].join(
    ' ',
  );
}

export function errorReply(status: number, code: string): FakeReply {
  return { status, body: { error: { code, message: 'refused', requestId: 'r1' } } };
}

export function savedReply(): FakeReply {
  return { status: 200, body: { data: { hasPassword: true } } };
}

export function codeSentReply(): FakeReply {
  return { status: 202, body: { data: { status: 'code-sent' } } };
}

export function sessionReply(identity: SignInIdentity): FakeReply {
  return { status: 201, body: { data: { token: identity.sessionValue, userId: identity.userId } } };
}

export function profileReply(email: string, hasPassword: boolean): FakeReply {
  return {
    status: 200,
    body: { data: { dailyGoal: 20, dayStreak: 0, email, entitlements: [], hasPassword, timezone: 'UTC', xpToday: 0 } },
  };
}

export function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
