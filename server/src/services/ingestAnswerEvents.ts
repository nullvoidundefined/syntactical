// Stores one upload batch (B-32, B-33). Events are checked against the answer key before any
// write; then, in one transaction, the user's row is locked (concurrent uploads for a user
// serialize), the timestamps are bounded, the events are inserted once by (user_id, event_id)
// with is_correct derived from the answer key, and daily progress is recomputed.
import type { Database } from '../clients/database.js';
import { withTransaction } from '../clients/withTransaction.js';
import { SYNC } from '../constants/sync.js';
import type { AnswerEventInput } from '../schemas/answerEventSchemas.js';
import type { AnswerKey } from '../types/AnswerKey.js';
import type { IngestResult } from '../types/IngestResult.js';

import { recomputeDailyProgress } from './recomputeDailyProgress.js';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const { FUTURE_TOLERANCE_MINUTES, PAST_TOLERANCE_DAYS } = SYNC;
const FUTURE_TOLERANCE_MS = FUTURE_TOLERANCE_MINUTES * MINUTE_MS;
const PAST_TOLERANCE_MS = PAST_TOLERANCE_DAYS * DAY_MS;

function isAnswerable(answerKey: AnswerKey, { bankKey, choiceIndex, questionId }: AnswerEventInput): boolean {
  const entry = answerKey.get(bankKey)?.get(questionId);
  return entry !== undefined && choiceIndex < entry.choiceCount;
}

function ids(events: readonly AnswerEventInput[]): string[] {
  return events.map((event) => event.eventId);
}

async function ingestAnswerEvents(
  database: Database,
  answerKey: AnswerKey,
  userId: string,
  events: readonly AnswerEventInput[],
  now: Date,
): Promise<IngestResult> {
  const invalid = events.filter((event) => !isAnswerable(answerKey, event));
  if (invalid.length > 0) {
    return { eventIds: ids(invalid), kind: 'invalid-events' };
  }
  return withTransaction(database, async (client): Promise<IngestResult> => {
    const { rows: users } = await client.query<{ created_at: Date; timezone: string | null }>(
      'SELECT created_at, timezone FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    const [user] = users;
    if (!user) {
      return { eventIds: ids(events), kind: 'invalid-events' };
    }
    const latest = now.getTime() + FUTURE_TOLERANCE_MS;
    const earliest = user.created_at.getTime() - PAST_TOLERANCE_MS;
    const outOfRange = events.filter((event) => {
      const answeredAt = Date.parse(event.answeredAt);
      return answeredAt > latest || answeredAt < earliest;
    });
    if (outOfRange.length > 0) {
      return { eventIds: ids(outOfRange), kind: 'timestamp-out-of-range' };
    }
    const { rowCount } = await client.query(
      `INSERT INTO answer_events
         (user_id, event_id, bank_key, question_id, choice_index, answered_at, round_kind, is_correct, received_at)
       SELECT $1, event_id, bank_key, question_id, choice_index, answered_at, round_kind, is_correct, clock_timestamp()
       FROM unnest($2::uuid[], $3::text[], $4::text[], $5::int[], $6::timestamptz[], $7::text[], $8::boolean[])
         AS t(event_id, bank_key, question_id, choice_index, answered_at, round_kind, is_correct)
       ON CONFLICT (user_id, event_id) DO NOTHING`,
      [
        userId,
        ids(events),
        events.map((event) => event.bankKey),
        events.map((event) => event.questionId),
        events.map((event) => event.choiceIndex),
        events.map((event) => event.answeredAt),
        events.map((event) => event.roundKind),
        events.map(({ bankKey, choiceIndex, questionId }) => choiceIndex === answerKey.get(bankKey)?.get(questionId)?.answerIndex),
      ],
    );
    const totals = await recomputeDailyProgress(client, userId, user.timezone, now);
    return { kind: 'stored', totals: { ...totals, insertedCount: rowCount ?? 0 } };
  });
}

export { ingestAnswerEvents };
