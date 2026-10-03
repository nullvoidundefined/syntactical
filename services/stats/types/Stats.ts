// The persisted lifetime stats, schema v2. The `tracks` field keeps its name
// so saved stats from earlier builds still load; v1's `streak` is renamed
// `answerStreak` (consecutive correct answers) so it is never confused with
// the day streak. `syncCursor` is the opaque download cursor once signed in.
import type { GoalChange } from '@syntactical/progress';

import type { LanguageDifficultyStats } from './LanguageDifficultyStats';

export type Stats = {
  answerStreak: { best: number; current: number };
  goalHistory: GoalChange[];
  isSignUpPromptDismissed: boolean;
  syncCursor?: string;
  totals: { attempted: number; correct: number };
  tracks: Record<string, LanguageDifficultyStats>;
  version: number;
};
