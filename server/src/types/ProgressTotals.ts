import type { DailyProgress } from '@syntactical/progress';

interface ProgressTotals {
  dailyProgress: DailyProgress[];
  dayStreak: number;
  xpToday: number;
  xpTotal: number;
}

export type { ProgressTotals };
