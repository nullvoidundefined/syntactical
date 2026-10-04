// Machine-readable error codes; clients switch on these, never on messages.
const ERROR_CODES = {
  AUTH: {
    INVALID_CODE: 'AUTH_INVALID_CODE',
    SESSION_REQUIRED: 'AUTH_SESSION_REQUIRED',
  },
  CSRF: {
    HEADER_MISSING: 'CSRF_HEADER_MISSING',
  },
  ENTITLEMENT: {
    REQUIRED: 'ENTITLEMENT_REQUIRED',
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

export { createErrorResponse, ERROR_CODES };
export type { ErrorCode, ErrorResponse };
