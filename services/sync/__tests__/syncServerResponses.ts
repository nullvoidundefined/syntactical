// The answer-events server's response contract, copied from server/src
// (routes/answerEvents.ts, errors.ts, services/ingestAnswerEvents.ts,
// services/listAnswerEvents.ts, middleware/rateLimit.ts,
// middleware/requireSession.ts) so client tests never hand-write a body.
import type { AnswerEvent, DailyProgress } from '@syntactical/progress';

export type ServerResponse = { status: number; body: unknown };

export const SERVER_ERROR_CODES = {
  EVENT_CAP_REACHED: 'SYNC_EVENT_CAP_REACHED',
  INTERNAL_ERROR: 'SERVER_INTERNAL_ERROR',
  INVALID_BODY: 'INPUT_INVALID_BODY',
  INVALID_EVENTS: 'SYNC_INVALID_EVENTS',
  INVALID_QUERY: 'INPUT_INVALID_QUERY',
  NOT_FOUND: 'ROUTING_NOT_FOUND',
  PAYLOAD_TOO_LARGE: 'INPUT_PAYLOAD_TOO_LARGE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SERVER_BUSY: 'SERVER_BUSY',
  SESSION_REQUIRED: 'AUTH_SESSION_REQUIRED',
  TIMESTAMP_OUT_OF_RANGE: 'SYNC_TIMESTAMP_OUT_OF_RANGE',
} as const;

export type ServerErrorCode = (typeof SERVER_ERROR_CODES)[keyof typeof SERVER_ERROR_CODES];

export const SERVER_STATUS = {
  BAD_REQUEST: 400,
  INTERNAL_ERROR: 500,
  NOT_FOUND: 404,
  OK: 200,
  PAYLOAD_TOO_LARGE: 413,
  SERVICE_UNAVAILABLE: 503,
  TOO_MANY_REQUESTS: 429,
  UNAUTHORIZED: 401,
  UNPROCESSABLE: 422,
} as const;

// The status and message the server sends with each code.
const ERROR_DETAILS: Record<ServerErrorCode, { message: string; status: number }> = {
  AUTH_SESSION_REQUIRED: { message: 'Sign-in required', status: SERVER_STATUS.UNAUTHORIZED },
  INPUT_INVALID_BODY: { message: 'Invalid request body', status: SERVER_STATUS.BAD_REQUEST },
  INPUT_INVALID_QUERY: { message: 'Invalid query', status: SERVER_STATUS.BAD_REQUEST },
  INPUT_PAYLOAD_TOO_LARGE: { message: 'Too many events in one batch', status: SERVER_STATUS.PAYLOAD_TOO_LARGE },
  ROUTING_NOT_FOUND: { message: 'Not found', status: SERVER_STATUS.NOT_FOUND },
  RATE_LIMIT_EXCEEDED: { message: 'Too many requests', status: SERVER_STATUS.TOO_MANY_REQUESTS },
  SERVER_BUSY: { message: 'Server busy, retry shortly', status: SERVER_STATUS.SERVICE_UNAVAILABLE },
  SERVER_INTERNAL_ERROR: { message: 'Internal server error', status: SERVER_STATUS.INTERNAL_ERROR },
  SYNC_EVENT_CAP_REACHED: { message: 'Stored event limit reached', status: SERVER_STATUS.UNPROCESSABLE },
  SYNC_INVALID_EVENTS: { message: 'Events do not match the answer key', status: SERVER_STATUS.UNPROCESSABLE },
  SYNC_TIMESTAMP_OUT_OF_RANGE: { message: 'Event timestamps out of range', status: SERVER_STATUS.UNPROCESSABLE },
};

// The 422 codes whose body names the offending events.
export const CODES_WITH_EVENT_IDS: readonly ServerErrorCode[] = [
  SERVER_ERROR_CODES.INVALID_EVENTS,
  SERVER_ERROR_CODES.TIMESTAMP_OUT_OF_RANGE,
];

export const FAKE_REQUEST_ID = 'req-fake-0001';

// The upload totals after a stored batch; the client reads none of the numbers,
// so they are fixed and only insertedCount varies.
export function buildUploadTotals(insertedCount: number): {
  dailyProgress: DailyProgress[];
  dayStreak: number;
  insertedCount: number;
  xpToday: number;
  xpTotal: number;
} {
  return {
    dailyProgress: [{ isGoalMet: true, localDate: '2026-10-01', xp: 30 }],
    dayStreak: 1,
    insertedCount,
    xpToday: 0,
    xpTotal: 30,
  };
}

// POST /v1/answer-events 200 for a stored batch.
export function buildUploadSuccess(insertedCount: number): ServerResponse {
  return { status: SERVER_STATUS.OK, body: { data: buildUploadTotals(insertedCount) } };
}

// GET /v1/answer-events 200: one page; nextCursor is null on the last page.
export function buildDownloadPage(events: AnswerEvent[], nextCursor: string | null): ServerResponse {
  return { status: SERVER_STATUS.OK, body: { data: { events, nextCursor } } };
}

// The createErrorResponse envelope: details first, then code, message, requestId.
export function buildErrorResponse(
  code: ServerErrorCode,
  details: Record<string, unknown> = {},
  status: number = ERROR_DETAILS[code].status,
): ServerResponse {
  return { status, body: { error: { ...details, code, message: ERROR_DETAILS[code].message, requestId: FAKE_REQUEST_ID } } };
}

// 503 SERVER_BUSY when a database statement or lock timeout ends the request
// (middleware/errorHandler.ts); nothing is stored.
export function buildServerBusy(): ServerResponse {
  return buildErrorResponse(SERVER_ERROR_CODES.SERVER_BUSY);
}

// A 422 naming the offending events, as SYNC_INVALID_EVENTS or SYNC_TIMESTAMP_OUT_OF_RANGE.
export function buildRejectedEvents(
  code: typeof SERVER_ERROR_CODES.INVALID_EVENTS | typeof SERVER_ERROR_CODES.TIMESTAMP_OUT_OF_RANGE,
  eventIds: unknown,
): ServerResponse {
  return buildErrorResponse(code, { eventIds });
}

// The code the server answers a given failure status with on these routes;
// any other status carries the internal-error envelope.
export function buildFailure(status: number): ServerResponse {
  const codeByStatus: Record<number, ServerErrorCode> = {
    400: SERVER_ERROR_CODES.INVALID_BODY,
    401: SERVER_ERROR_CODES.SESSION_REQUIRED,
    413: SERVER_ERROR_CODES.PAYLOAD_TOO_LARGE,
    422: SERVER_ERROR_CODES.EVENT_CAP_REACHED,
    429: SERVER_ERROR_CODES.RATE_LIMIT_EXCEEDED,
    503: SERVER_ERROR_CODES.SERVER_BUSY,
  };
  return buildErrorResponse(codeByStatus[status] ?? SERVER_ERROR_CODES.INTERNAL_ERROR, {}, status);
}
