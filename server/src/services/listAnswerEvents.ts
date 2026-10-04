// Reads one page of a user's answer events (B-36): ordered by received_at then event_id, at
// most PAGE_SIZE events, with a cursor built from the last returned row only when more remain.
// The cursor key is selected as text so microsecond precision survives; every value is a
// query parameter.
import type { Database } from '../clients/database.js';
import { SYNC } from '../constants/sync.js';
import type { AnswerEventCursor } from '../schemas/answerEventSchemas.js';

interface AnswerEventPageEvent {
  answeredAt: string;
  bankKey: string;
  choiceIndex: number;
  eventId: string;
  isCorrect: boolean;
  questionId: string;
  roundKind: string;
}

interface AnswerEventPage {
  events: AnswerEventPageEvent[];
  nextCursor: string | null;
}

interface PageRow {
  answered_at: Date;
  bank_key: string;
  choice_index: number;
  event_id: string;
  is_correct: boolean;
  question_id: string;
  received_key: string;
  round_kind: string;
}

const PAGE_SQL = `
  SELECT event_id, bank_key, question_id, choice_index, answered_at, round_kind, is_correct,
         to_char(received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS received_key
    FROM answer_events
   WHERE user_id = $1
     AND ($2::timestamptz IS NULL OR (received_at, event_id) > ($2::timestamptz, $3::uuid))
   ORDER BY received_at, event_id
   LIMIT $4`;

function encodeCursor({ event_id, received_key }: PageRow): string {
  return Buffer.from(JSON.stringify({ e: event_id, r: received_key })).toString('base64url');
}

async function listAnswerEvents(
  database: Database,
  userId: string,
  after: AnswerEventCursor | undefined,
): Promise<AnswerEventPage> {
  const { e, r } = after ?? { e: null, r: null };
  const { rows } = await database.query<PageRow>(PAGE_SQL, [
    userId,
    r,
    e,
    SYNC.PAGE_SIZE + 1,
  ]);
  const page = rows.slice(0, SYNC.PAGE_SIZE);
  const events = page.map(
    ({ answered_at, bank_key, choice_index, event_id, is_correct, question_id, round_kind }) => ({
      answeredAt: answered_at.toISOString(),
      bankKey: bank_key,
      choiceIndex: choice_index,
      eventId: event_id,
      isCorrect: is_correct,
      questionId: question_id,
      roundKind: round_kind,
    }),
  );
  const hasMore = rows.length > SYNC.PAGE_SIZE;
  return { events, nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null };
}

export { listAnswerEvents };
