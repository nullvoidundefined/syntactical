// Reads the profile out of a GET or PATCH /v1/me response body; null when
// any field the app needs is missing or not a non-negative integer.
import type { Profile } from './types/Profile';

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function parseProfile(body: unknown): Profile | null {
  const data = (body as { data?: unknown } | null)?.data;
  if (data === null || typeof data !== 'object') return null;
  const { dailyGoal, dayStreak, xpToday } = data as Record<string, unknown>;
  if (!isCount(dailyGoal) || !isCount(dayStreak) || !isCount(xpToday)) return null;
  const { email, hasPassword } = data as Record<string, unknown>;
  return {
    dailyGoal,
    dayStreak,
    ...(typeof email === 'string' ? { email } : {}),
    ...(typeof hasPassword === 'boolean' ? { hasPassword } : {}),
    xpToday,
  };
}
