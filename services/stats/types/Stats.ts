// The persisted lifetime stats. The `tracks` field keeps its name so saved
// stats from earlier builds still load.
import type { LanguageDifficultyStats } from './LanguageDifficultyStats';

export type Stats = {
  streak: { best: number; current: number };
  totals: { attempted: number; correct: number };
  tracks: Record<string, LanguageDifficultyStats>;
  version: number;
};
