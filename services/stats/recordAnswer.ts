// Folds one answer into the stats: updates the streak, the totals, and the
// counts for the round's language and difficulty.
import { buildStatsKey } from './buildStatsKey';
import { readLanguageDifficultyStats } from './readLanguageDifficultyStats';
import type { RoundKey } from './types/RoundKey';
import type { Stats } from './types/Stats';

export function recordAnswer(stats: Stats, event: RoundKey & { wasCorrect: boolean }): Stats {
  const { wasCorrect } = event;
  const currentStreak = wasCorrect ? stats.streak.current + 1 : 0;
  const { attempted, correct, ...rest } = readLanguageDifficultyStats(stats, event);
  return {
    ...stats,
    streak: { best: Math.max(stats.streak.best, currentStreak), current: currentStreak },
    totals: {
      attempted: stats.totals.attempted + 1,
      correct: stats.totals.correct + (wasCorrect ? 1 : 0),
    },
    tracks: {
      ...stats.tracks,
      [buildStatsKey(event)]: {
        ...rest,
        attempted: attempted + 1,
        correct: correct + (wasCorrect ? 1 : 0),
      },
    },
  };
}
