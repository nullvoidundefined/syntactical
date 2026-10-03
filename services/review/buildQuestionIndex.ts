// Indexes the questions of every bank the answer events name, read only
// from local copies (cached or bundled), so the index works offline. A bank
// with no local copy (an uncached paid bank) contributes nothing, and its
// questions are skipped by every review built on this index.
import type { AnswerEvent } from '@syntactical/progress';

import type { ContentAccess } from '../content/types/ContentAccess';

import type { ReviewQuestion } from './types/ReviewQuestion';

export function buildQuestionIndex(events: readonly AnswerEvent[], readLocalBank: ContentAccess['readLocalBank']): Map<string, ReviewQuestion> {
  const index = new Map<string, ReviewQuestion>();
  const bankKeys = new Set(events.map(({ bankKey }) => bankKey));
  for (const bankKey of bankKeys) {
    const [language, difficulty] = bankKey.split('/');
    if (!language || !difficulty) continue;
    const bank = readLocalBank(language, difficulty);
    for (const question of bank?.questions ?? []) {
      index.set(question.id, { difficulty, language, question });
    }
  }
  return index;
}
