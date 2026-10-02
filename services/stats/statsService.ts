// Pure stats folding: each function returns a new stats object from an
// event. The persisted `tracks` field keeps its name so saved stats load.
import { STORAGE_SCHEMA_VERSION } from '../../constants/appConfig';

export type LanguageDifficultyStats = { attempted: number; correct: number; completions: number };
export type Stats = {
  version: number;
  streak: { current: number; best: number };
  totals: { attempted: number; correct: number };
  tracks: Record<string, LanguageDifficultyStats>;
};
type RoundKey = { language: string; difficulty: string };

export function createEmptyStats(): Stats {
  return {
    version: STORAGE_SCHEMA_VERSION,
    streak: { current: 0, best: 0 },
    totals: { attempted: 0, correct: 0 },
    tracks: {},
  };
}

export function buildStatsKey({ language, difficulty }: RoundKey): string {
  return `${language}:${difficulty}`;
}

function readLanguageDifficultyStats(stats: Stats, roundKey: RoundKey): LanguageDifficultyStats {
  return stats.tracks[buildStatsKey(roundKey)] ?? { attempted: 0, correct: 0, completions: 0 };
}

export function recordAnswer(stats: Stats, event: RoundKey & { wasCorrect: boolean }): Stats {
  const { wasCorrect } = event;
  const currentStreak = wasCorrect ? stats.streak.current + 1 : 0;
  const entry = readLanguageDifficultyStats(stats, event);
  return {
    ...stats,
    streak: { current: currentStreak, best: Math.max(stats.streak.best, currentStreak) },
    totals: {
      attempted: stats.totals.attempted + 1,
      correct: stats.totals.correct + (wasCorrect ? 1 : 0),
    },
    tracks: {
      ...stats.tracks,
      [buildStatsKey(event)]: {
        ...entry,
        attempted: entry.attempted + 1,
        correct: entry.correct + (wasCorrect ? 1 : 0),
      },
    },
  };
}

export function recordCompletion(stats: Stats, event: RoundKey): Stats {
  const entry = readLanguageDifficultyStats(stats, event);
  return {
    ...stats,
    tracks: { ...stats.tracks, [buildStatsKey(event)]: { ...entry, completions: entry.completions + 1 } },
  };
}
