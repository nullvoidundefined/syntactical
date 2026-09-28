// Aggregates every per-language, per-difficulty question bank behind a
// single lookup so callers never import a data file directly.

import { pythonMedium } from './python/medium.js';
import { pythonHard } from './python/hard.js';
import { postgresMedium } from './postgres/medium.js';
import { postgresHard } from './postgres/hard.js';

const QUESTION_BANKS = {
  python: {
    medium: pythonMedium,
    hard: pythonHard,
  },
  postgres: {
    medium: postgresMedium,
    hard: postgresHard,
  },
};

/**
 * Look up the question bank for a language/difficulty pair.
 * @param {string} language - 'python' | 'postgres'
 * @param {string} difficulty - 'medium' | 'hard'
 * @returns {Array<object>} the raw question list for that combination
 */
export function getQuestionBank(language, difficulty) {
  return QUESTION_BANKS[language]?.[difficulty] ?? [];
}
