// Folds one completed round into the stats for its language and difficulty.
import { buildStatsKey } from './buildStatsKey';
import { readLanguageDifficultyStats } from './readLanguageDifficultyStats';
import type { RoundKey } from './types/RoundKey';
import type { Stats } from './types/Stats';

export function recordCompletion(stats: Stats, event: RoundKey): Stats {
  const entry = readLanguageDifficultyStats(stats, event);
  return {
    ...stats,
    tracks: {
      ...stats.tracks,
      [buildStatsKey(event)]: { ...entry, completions: entry.completions + 1 },
    },
  };
}
