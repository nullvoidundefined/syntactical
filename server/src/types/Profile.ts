interface Profile {
  dailyGoal: number;
  dayStreak: number;
  email: string;
  entitlements: string[];
  timezone: string | null;
  xpToday: number;
  xpTotal: number;
}

export type { Profile };
