// Folds one answer into the stats: updates the answer streak, the totals,
// and the counts for the round's language and difficulty. The answer event
// itself is appended to the event log by the stats provider.
import { buildStatsKey } from './buildStatsKey';
import { readLanguageDifficultyStats } from './readLanguageDifficultyStats';
import type { RoundKey } from './types/RoundKey';
import type { Stats } from './types/Stats';

export function recordAnswer(stats: Stats, event: RoundKey & { wasCorrect: boolean }): Stats {
  const { wasCorrect } = event;
  const { best, current } = stats.answerStreak;
  const currentStreak = wasCorrect ? current + 1 : 0;
  const { attempted, correct, ...rest } = readLanguageDifficultyStats(stats, event);
  return {
    ...stats,
    answerStreak: { best: Math.max(best, currentStreak), current: currentStreak },
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
