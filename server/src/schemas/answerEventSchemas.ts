// Request body for POST /v1/answer-events and the download query for GET. A client isCorrect
// is not in the schema, so zod strips it: the server derives correctness from the answer key.
import { z } from 'zod';

import { SYNC } from '../constants/sync.js';

const answerEvent = z.object({
  answeredAt: z.iso.datetime({ offset: true }),
  bankKey: z.string().max(64),
  choiceIndex: z.number().int().min(0),
  eventId: z.uuid(),
  questionId: z.string().max(128),
  roundKind: z.enum(['bank', 'topic', 'review']),
});

const MIN_STORABLE_YEAR = 1;

// True when the text is a real instant: the date part survives a round trip, so 2026-02-30 fails.
function isRealInstant(text: string): boolean {
  // Postgres has no year 0, so a year below 0001 is not storable.
  if (Number(text.slice(0, 4)) < MIN_STORABLE_YEAR) return false;
  const parsed = new Date(text.slice(0, 23) + 'Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 19) === text.slice(0, 19);
}

// Decodes the cursor text to JSON; malformed JSON is a result carrying the error, never a throw.
function decodeCursorJson(raw: string): { error?: unknown; isValid: boolean; value?: unknown } {
  try {
    return { isValid: true, value: JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown };
  } catch (error) {
    return { error, isValid: false };
  }
}

const cursorKey = z
  .object({
    e: z.uuid(),
    r: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/)
      .refine(isRealInstant, 'Invalid instant'),
  })
  .strict();

// The opaque cursor: base64url of {"r": received_at text, "e": event id}. A decode or parse
// failure is a schema failure, never a throw.
const downloadCursor = z
  .string()
  .max(SYNC.MAX_CURSOR_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/)
  .transform((raw, ctx) => {
    const { isValid, value } = decodeCursorJson(raw);
    if (!isValid) {
      ctx.addIssue({ code: 'custom', message: 'Invalid cursor' });
      return z.NEVER;
    }
    return value;
  })
  .pipe(cursorKey);

const answerEventSchemas = {
  download: z.object({ after: downloadCursor.optional() }),
  upload: z.object({ events: z.array(answerEvent).min(1) }),
};

type AnswerEventInput = z.infer<typeof answerEvent>;
type AnswerEventCursor = z.infer<typeof cursorKey>;

export { answerEventSchemas };
export type { AnswerEventCursor, AnswerEventInput };
