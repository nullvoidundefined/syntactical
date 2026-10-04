// The signed-in summary: the last /me profile plus XP from events not yet
// synced. When those events newly meet today's goal, today joins the streak.
import type { Profile } from './types/Profile';
import type { ProgressSummary } from './types/ProgressSummary';

export function combineProfileSummary(profile: Profile, unsyncedXpToday: number): ProgressSummary {
  const { dailyGoal, dayStreak, xpToday: syncedXpToday } = profile;
  const xpToday = syncedXpToday + unsyncedXpToday;
  const isNewlyMet = syncedXpToday < dailyGoal && xpToday >= dailyGoal;
  return { dailyGoal, dayStreak: dayStreak + (isNewlyMet ? 1 : 0), xpToday };
}
