// Builds the server's answer key from the content directory's manifest and bank files, so
// answer events can derive isCorrect from choiceIndex and reject unknown banks, questions,
// and out-of-range choices.
import type { AnswerKey } from '../types/AnswerKey.js';

import { readServerQuestions } from './readServerQuestions.js';
import { toAnswerKey } from './toAnswerKey.js';

async function readServerManifest(contentDir: string): Promise<AnswerKey> {
  return toAnswerKey(await readServerQuestions(contentDir));
}

export { readServerManifest };
