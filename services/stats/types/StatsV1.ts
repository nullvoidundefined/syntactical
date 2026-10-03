// The stored stats shape of schema v1, read only to migrate it to v2.
import type { LanguageDifficultyStats } from './LanguageDifficultyStats';

export type StatsV1 = {
  streak: { best: number; current: number };
  totals: { attempted: number; correct: number };
  tracks: Record<string, LanguageDifficultyStats>;
  version: 1;
};
