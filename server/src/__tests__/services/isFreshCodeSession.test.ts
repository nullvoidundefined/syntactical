// Task 7.6 (B-80, B-85 freshness; spec decision 33): a session is a fresh code sign-in when it was
// opened by a one-time code at most 10 minutes ago. A password session is never fresh, however new.
import { describe, expect, it } from 'vitest';

import { isFreshCodeSession } from '../../services/isFreshCodeSession.js';

const SECOND_MS = 1_000;
const MINUTE_MS = 60_000;
// The spec's window (AUTH.PASSWORD.REAUTH_WINDOW_MS), written out so the test does not borrow it.
const WINDOW_MS = 10 * MINUTE_MS;
const NOW = new Date('2026-10-05T12:00:00.000Z');

function ago(milliseconds: number): Date {
  return new Date(NOW.getTime() - milliseconds);
}

describe('isFreshCodeSession', () => {
  it('is true for a code session created 9 minutes 59 seconds ago', () => {
    expect(isFreshCodeSession({ authMethod: 'code', createdAt: ago(WINDOW_MS - SECOND_MS) }, NOW)).toBe(true);
  });

  it('is true for a code session created exactly 10 minutes ago (at most 10 minutes old)', () => {
    expect(isFreshCodeSession({ authMethod: 'code', createdAt: ago(WINDOW_MS) }, NOW)).toBe(true);
  });

  it('is false for a code session created 10 minutes 1 second ago', () => {
    expect(isFreshCodeSession({ authMethod: 'code', createdAt: ago(WINDOW_MS + SECOND_MS) }, NOW)).toBe(false);
  });

  it('is true for a code session created this instant', () => {
    expect(isFreshCodeSession({ authMethod: 'code', createdAt: ago(0) }, NOW)).toBe(true);
  });

  it('is false for a password session created 1 second ago, and for one created this instant', () => {
    expect(isFreshCodeSession({ authMethod: 'password', createdAt: ago(SECOND_MS) }, NOW)).toBe(false);
    expect(isFreshCodeSession({ authMethod: 'password', createdAt: ago(0) }, NOW)).toBe(false);
  });

  it('is false for a code session created days ago', () => {
    expect(isFreshCodeSession({ authMethod: 'code', createdAt: ago(3 * 24 * 60 * MINUTE_MS) }, NOW)).toBe(false);
  });
});
