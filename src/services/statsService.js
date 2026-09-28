// Pure business logic for deriving the next persisted-stats shape from an
// event. Reads/writes go through clients/localStorageClient; this module
// only ever computes new plain objects.

import { STORAGE_SCHEMA_VERSION } from '../constants/appConfig.js';

/**
 * The default shape written the first time no stats exist yet.
 */
export function createEmptyStats() {
  return {
    version: STORAGE_SCHEMA_VERSION,
    streak: { current: 0, best: 0 },
    totals: { attempted: 0, correct: 0 },
    tracks: {},
  };
}

function trackKey(language, difficulty) {
  return `${language}:${difficulty}`;
}

function getOrCreateTrack(stats, language, difficulty) {
  const key = trackKey(language, difficulty);
  return stats.tracks[key] ?? { attempted: 0, correct: 0, completions: 0 };
}

/**
 * Fold one answered question into the stats object, returning a new object.
 * @param {object} stats - current persisted stats
 * @param {{language: string, difficulty: string, wasCorrect: boolean}} event
 */
export function recordAnswer(stats, { language, difficulty, wasCorrect }) {
  const nextCurrentStreak = wasCorrect ? stats.streak.current + 1 : 0;
  const track = getOrCreateTrack(stats, language, difficulty);

  return {
    ...stats,
    streak: {
      current: nextCurrentStreak,
      best: Math.max(stats.streak.best, nextCurrentStreak),
    },
    totals: {
      attempted: stats.totals.attempted + 1,
      correct: stats.totals.correct + (wasCorrect ? 1 : 0),
    },
    tracks: {
      ...stats.tracks,
      [trackKey(language, difficulty)]: {
        ...track,
        attempted: track.attempted + 1,
        correct: track.correct + (wasCorrect ? 1 : 0),
      },
    },
  };
}

/**
 * Mark a full round as completed for a given track.
 * @param {object} stats
 * @param {{language: string, difficulty: string}} event
 */
export function recordCompletion(stats, { language, difficulty }) {
  const track = getOrCreateTrack(stats, language, difficulty);
  return {
    ...stats,
    tracks: {
      ...stats.tracks,
      [trackKey(language, difficulty)]: {
        ...track,
        completions: track.completions + 1,
      },
    },
  };
}
