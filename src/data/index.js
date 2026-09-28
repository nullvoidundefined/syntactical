// Aggregates every per-language, per-difficulty question bank behind a
// single lookup so callers never import a data file directly.

import { pythonEasy } from './python/easy.js';
import { pythonMedium } from './python/medium.js';
import { pythonHard } from './python/hard.js';
import { postgresEasy } from './postgres/easy.js';
import { postgresMedium } from './postgres/medium.js';
import { postgresHard } from './postgres/hard.js';
import { javascriptEasy } from './javascript/easy.js';
import { javascriptMedium } from './javascript/medium.js';
import { javascriptHard } from './javascript/hard.js';

const QUESTION_BANKS = {
  python: {
    easy: pythonEasy,
    medium: pythonMedium,
    hard: pythonHard,
  },
  postgres: {
    easy: postgresEasy,
    medium: postgresMedium,
    hard: postgresHard,
  },
  javascript: {
    easy: javascriptEasy,
    medium: javascriptMedium,
    hard: javascriptHard,
  },
};

/**
 * Look up the question bank for a language/difficulty pair.
 * @param {string} language - 'python' | 'postgres' | 'javascript'
 * @param {string} difficulty - 'easy' | 'medium' | 'hard'
 * @returns {Array<object>} the raw question list for that combination
 */
export function getQuestionBank(language, difficulty) {
  return QUESTION_BANKS[language]?.[difficulty] ?? [];
}
