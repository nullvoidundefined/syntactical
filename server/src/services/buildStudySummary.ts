// Tallies a week of answer events into the study note's summary: answers and correct answers
// overall and per bank (labelled "Python · Easy"), answers given in review rounds, and the
// misconceptions most often revealed by a wrong choice. A wrong multiple choice or A/B answer
// reveals its choice's misconceptionId; a wrong true/false answer reveals the question's. Events
// for a question the server no longer has still count toward the totals.
import { DIFFICULTIES } from '@syntactical/content-schema';
import type { Question } from '@syntactical/content-schema';

import { STUDY_NOTE } from '../constants/studyNote.js';
import type { ContentLabels } from '../types/ContentLabels.js';
import type { QuestionIndex } from '../types/QuestionIndex.js';
import type { StudyNoteEvent } from '../types/StudyNoteEvent.js';
import type { StudySummary } from '../types/StudySummary.js';

const DIFFICULTY_LABELS = new Map<string, string>(DIFFICULTIES.map(({ id, label }) => [id, label]));

function labelBank(bankKey: string, labels: ContentLabels): string {
  const [language = bankKey, difficulty = ''] = bankKey.split('/');
  const languageLabel = labels.languages.get(language) ?? language;
  return `${languageLabel} · ${DIFFICULTY_LABELS.get(difficulty) ?? difficulty}`;
}

function readRevealed(question: Question, choiceIndex: number): string | undefined {
  if (question.type === 'bool') return question.misconceptionId;
  return question.choices[choiceIndex]?.misconceptionId;
}

function buildStudySummary(
  events: readonly StudyNoteEvent[],
  questions: QuestionIndex,
  labels: ContentLabels,
): StudySummary {
  const banks = new Map<string, { answers: number; correct: number }>();
  const misses = new Map<string, number>();
  let correct = 0;
  let reviewAnswers = 0;
  for (const { bankKey, choiceIndex, isCorrect, questionId, roundKind } of events) {
    const bank = banks.get(bankKey) ?? { answers: 0, correct: 0 };
    bank.answers += 1;
    if (isCorrect) {
      bank.correct += 1;
      correct += 1;
    }
    banks.set(bankKey, bank);
    if (roundKind === 'review') reviewAnswers += 1;
    const question = questions.get(bankKey)?.get(questionId);
    const revealed = !isCorrect && question ? readRevealed(question, choiceIndex) : undefined;
    if (revealed && labels.misconceptions.has(revealed)) misses.set(revealed, (misses.get(revealed) ?? 0) + 1);
  }
  const missedMisconceptions = [...misses]
    .sort(([leftId, left], [rightId, right]) => right - left || (leftId < rightId ? -1 : 1))
    .slice(0, STUDY_NOTE.TOP_MISCONCEPTIONS)
    .map(([id, count]) => ({ description: labels.misconceptions.get(id) ?? id, misses: count }));
  return {
    answers: events.length,
    banks: [...banks]
      .sort(([, left], [, right]) => right.answers - left.answers)
      .map(([bankKey, tally]) => ({ ...tally, label: labelBank(bankKey, labels) })),
    correct,
    missedMisconceptions,
    reviewAnswers,
  };
}

export { buildStudySummary };
