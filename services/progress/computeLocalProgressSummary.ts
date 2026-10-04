// The progress summary computed on the device from answer events and the
// local goal history: XP per local day in the given timezone, each day met
// against the goal in force that day, and the day streak ending today (or
// yesterday while today is still short of its goal).
import { computeDailyProgress, computeDayStreak, findDueReviewEventIds } from '@syntactical/progress';
import type { AnswerEvent, GoalChange } from '@syntactical/progress';

import { DEFAULT_DAILY_GOAL } from '../../constants/appConfig';

import { findGoalForDate } from './findGoalForDate';
import type { ProgressSummary } from './types/ProgressSummary';

type LocalProgressInput = {
  events: readonly AnswerEvent[];
  goalHistory: readonly GoalChange[];
  timezone: string;
  today: string;
};

export function computeLocalProgressSummary({ events, goalHistory, timezone, today }: LocalProgressInput): ProgressSummary {
  const goals = goalHistory.length > 0 ? goalHistory : [{ from: today, goal: DEFAULT_DAILY_GOAL }];
  const dueReviewIds = findDueReviewEventIds(events);
  const progress = computeDailyProgress(events, timezone, goals, ({ eventId }) => dueReviewIds.has(eventId));
  return {
    dailyGoal: findGoalForDate(goals, today),
    dayStreak: computeDayStreak(progress, today),
    xpToday: progress.find(({ localDate }) => localDate === today)?.xp ?? 0,
  };
}
