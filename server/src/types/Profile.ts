interface Profile {
  dailyGoal: number;
  dayStreak: number;
  email: string;
  entitlements: string[];
  hasPassword: boolean;
  timezone: string | null;
  xpToday: number;
  xpTotal: number;
}

export type { Profile };
