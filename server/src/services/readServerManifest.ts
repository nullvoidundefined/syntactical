// Builds the server's answer key from the content directory's manifest and bank files, so
// answer events can derive isCorrect from choiceIndex and reject unknown banks, questions,
// and out-of-range choices. Paid banks come only from the paid content directory.
import type { AnswerKey } from '../types/AnswerKey.js';

import { readServerQuestions } from './readServerQuestions.js';
import { toAnswerKey } from './toAnswerKey.js';

async function readServerManifest(contentDir: string, paidContentDir?: string): Promise<AnswerKey> {
  return toAnswerKey(await readServerQuestions(contentDir, paidContentDir));
}

export { readServerManifest };
