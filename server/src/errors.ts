// Machine-readable error codes; clients switch on these, never on messages.
const ERROR_CODES = {
  ADMIN: {
    REQUIRED: 'ADMIN_REQUIRED',
  },
  ASK: {
    DAILY_LIMIT_REACHED: 'ASK_DAILY_LIMIT_REACHED',
    UNAVAILABLE: 'ASK_UNAVAILABLE',
  },
  AUTH: {
    INVALID_CODE: 'AUTH_INVALID_CODE',
    INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
    PASSWORD_BREACHED: 'AUTH_PASSWORD_BREACHED',
    PASSWORD_TOO_LONG: 'AUTH_PASSWORD_TOO_LONG',
    PASSWORD_TOO_SHORT: 'AUTH_PASSWORD_TOO_SHORT',
    REAUTH_REQUIRED: 'AUTH_REAUTH_REQUIRED',
    SESSION_REQUIRED: 'AUTH_SESSION_REQUIRED',
  },
  CSRF: {
    HEADER_MISSING: 'CSRF_HEADER_MISSING',
  },
  INPUT: {
    CLIENT_ERROR: 'INPUT_CLIENT_ERROR',
    INVALID_BODY: 'INPUT_INVALID_BODY',
    INVALID_QUERY: 'INPUT_INVALID_QUERY',
    MALFORMED_JSON: 'INPUT_MALFORMED_JSON',
    PAYLOAD_TOO_LARGE: 'INPUT_PAYLOAD_TOO_LARGE',
    UNSUPPORTED_MEDIA_TYPE: 'INPUT_UNSUPPORTED_MEDIA_TYPE',
  },
  RATE_LIMIT: {
    EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  },
  ROUTING: {
    NOT_FOUND: 'ROUTING_NOT_FOUND',
  },
  SERVER: {
    BUSY: 'SERVER_BUSY',
    EMAIL_UNAVAILABLE: 'SERVER_EMAIL_UNAVAILABLE',
    INTERNAL_ERROR: 'SERVER_INTERNAL_ERROR',
  },
  STUDY_NOTE: {
    UNAVAILABLE: 'STUDY_NOTE_UNAVAILABLE',
  },
  SYNC: {
    EVENT_CAP_REACHED: 'SYNC_EVENT_CAP_REACHED',
    INVALID_EVENTS: 'SYNC_INVALID_EVENTS',
    TIMESTAMP_OUT_OF_RANGE: 'SYNC_TIMESTAMP_OUT_OF_RANGE',
  },
  WEBHOOK: {
    NOT_CONFIGURED: 'WEBHOOK_NOT_CONFIGURED',
    UNAUTHORIZED: 'WEBHOOK_UNAUTHORIZED',
  },
} as const;

import type { Response } from 'express';

type NestedValues<T> = T extends Record<string, infer V> ? (V extends string ? V : NestedValues<V>) : never;

type ErrorCode = NestedValues<typeof ERROR_CODES>;

interface ErrorResponse {
  error: { code: ErrorCode; message: string; requestId: string } & Record<string, unknown>;
}

// details adds fields to the error body, such as the eventIds a batch rejection names.
function createErrorResponse(
  code: ErrorCode,
  message: string,
  requestId: string,
  details: Record<string, unknown> = {},
): ErrorResponse {
  return { error: { ...details, code, message, requestId } };
}

// The one way a route or middleware answers with an error: the status plus the body above, with
// the request id the request-id middleware left in res.locals.
function sendError(res: Response, status: number, code: ErrorCode, message: string): void {
  const { requestId } = res.locals as { requestId: string };
  res.status(status).json(createErrorResponse(code, message, requestId));
}

export { createErrorResponse, ERROR_CODES, sendError };
export type { ErrorCode, ErrorResponse };
