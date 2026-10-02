// Reads the stats for one round, or zeroed counts when none exist yet.
import { buildStatsKey } from './buildStatsKey';
import type { LanguageDifficultyStats } from './types/LanguageDifficultyStats';
import type { RoundKey } from './types/RoundKey';
import type { Stats } from './types/Stats';

export function readLanguageDifficultyStats(
  stats: Stats,
  roundKey: RoundKey,
): LanguageDifficultyStats {
  return stats.tracks[buildStatsKey(roundKey)] ?? { attempted: 0, completions: 0, correct: 0 };
}
