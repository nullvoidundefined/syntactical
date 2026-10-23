// A user's answer events answered at or after a given instant, the window a study note covers.
import type { Database } from '../clients/database.js';
import type { StudyNoteEvent } from '../types/StudyNoteEvent.js';

async function listRecentAnswerEvents(database: Database, userId: string, since: Date): Promise<StudyNoteEvent[]> {
  const { rows } = await database.query<{
    bank_key: string;
    choice_index: number;
    is_correct: boolean;
    question_id: string;
    round_kind: StudyNoteEvent['roundKind'];
  }>(
    `SELECT bank_key, choice_index, is_correct, question_id, round_kind
     FROM answer_events WHERE user_id = $1 AND answered_at >= $2`,
    [userId, since],
  );
  return rows.map(
    ({ bank_key: bankKey, choice_index: choiceIndex, is_correct: isCorrect, question_id: questionId, round_kind }) => ({
      bankKey,
      choiceIndex,
      isCorrect,
      questionId,
      roundKind: round_kind,
    }),
  );
}

export { listRecentAnswerEvents };
