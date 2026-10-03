// Stores one upload batch (B-32, B-33). Events are checked against the answer key before any
// write; then, in one transaction, the user's row is locked without waiting (a concurrent upload for the user
// is answered busy), the timestamps are bounded, the per-user stored-event cap is enforced (a batch
// that would exceed it is refused whole; already-stored ids do not count), the events are inserted once by (user_id, event_id)
// with is_correct derived from the answer key, and daily progress is refreshed (refreshDailyProgress: incremental, or a full replay when the zone
// changed since it was built).
import type { Database } from '../clients/database.js';
import { withBoundedTransaction } from '../clients/withBoundedTransaction.js';
import { SYNC } from '../constants/sync.js';
import { UserBusyError } from '../errors/UserBusyError.js';
import type { AnswerEventInput } from '../schemas/answerEventSchemas.js';
import type { AnswerKey } from '../types/AnswerKey.js';
import type { IngestResult } from '../types/IngestResult.js';

import { lockUserRow } from './lockUserRow.js';
import { readStoredProgress } from './readStoredProgress.js';
import { refreshDailyProgress } from './refreshDailyProgress.js';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const { FUTURE_TOLERANCE_MINUTES, MAX_EVENTS_PER_USER, PAST_TOLERANCE_DAYS } = SYNC;
const FUTURE_TOLERANCE_MS = FUTURE_TOLERANCE_MINUTES * MINUTE_MS;
const PAST_TOLERANCE_MS = PAST_TOLERANCE_DAYS * DAY_MS;

function isAnswerable(answerKey: AnswerKey, { bankKey, choiceIndex, questionId }: AnswerEventInput): boolean {
  const entry = answerKey.get(bankKey)?.get(questionId);
  return entry !== undefined && choiceIndex < entry.choiceCount;
}

function isOutside(answeredAt: string, earliest: number, latest: number): boolean {
  const time = Date.parse(answeredAt);
  return time > latest || time < earliest;
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
  try {
    return await storeEvents(database, answerKey, userId, events, now);
  } catch (error) {
    if (error instanceof UserBusyError) {
      return { kind: 'busy' };
    }
    throw error;
  }
}

async function storeEvents(
  database: Database,
  answerKey: AnswerKey,
  userId: string,
  events: readonly AnswerEventInput[],
  now: Date,
): Promise<IngestResult> {
  return withBoundedTransaction(database, async (client): Promise<IngestResult> => {
    const lock = await lockUserRow(client, userId);
    if (lock.kind === 'missing') {
      return { eventIds: ids(events), kind: 'invalid-events' };
    }
    const { user } = lock;
    const latest = now.getTime() + FUTURE_TOLERANCE_MS;
    const earliest = user.created_at.getTime() - PAST_TOLERANCE_MS;
    const outOfRange = events.filter((event) => isOutside(event.answeredAt, earliest, latest));
    if (outOfRange.length > 0) {
      return { eventIds: ids(outOfRange), kind: 'timestamp-out-of-range' };
    }
    const batchIds = [...new Set(ids(events))];
    const { rows: stored } = await client.query<{ count: string }>(
      'SELECT count(*) FROM answer_events WHERE user_id = $1',
      [userId],
    );
    const { rows: known } = await client.query<{ count: string }>(
      'SELECT count(*) FROM answer_events WHERE user_id = $1 AND event_id = ANY($2::uuid[])',
      [userId, batchIds],
    );
    const newCount = batchIds.length - Number(known[0]?.count ?? 0);
    if (Number(stored[0]?.count ?? 0) + newCount > MAX_EVENTS_PER_USER) {
      return { kind: 'event-cap-reached' };
    }
    const { rows: insertedRows } = await client.query<{ event_id: string; question_id: string }>(
      `INSERT INTO answer_events
         (user_id, event_id, bank_key, question_id, choice_index, answered_at, round_kind, is_correct, received_at)
       SELECT $1, event_id, bank_key, question_id, choice_index, answered_at, round_kind, is_correct, clock_timestamp()
       FROM unnest($2::uuid[], $3::text[], $4::text[], $5::int[], $6::timestamptz[], $7::text[], $8::boolean[])
         AS t(event_id, bank_key, question_id, choice_index, answered_at, round_kind, is_correct)
       ON CONFLICT (user_id, event_id) DO NOTHING
       RETURNING event_id, question_id`,
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
    await refreshDailyProgress(client, userId, user, insertedRows, now);
    const totals = await readStoredProgress(client, userId, user.timezone, now);
    return { kind: 'stored', totals: { ...totals, insertedCount: insertedRows.length } };
  });
}

export { ingestAnswerEvents };
