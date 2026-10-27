import type { ProStatus } from './ProStatus.js';

interface Profile {
  dailyGoal: number;
  dayStreak: number;
  email: string;
  hasPassword: boolean;
  isAdmin: boolean;
  pro: ProStatus;
  timezone: string | null;
  xpToday: number;
  xpTotal: number;
}

export type { Profile };
