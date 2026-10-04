// Machine-readable error codes; clients switch on these, never on messages.
const ERROR_CODES = {
  AUTH: {
    INVALID_CODE: 'AUTH_INVALID_CODE',
    SESSION_REQUIRED: 'AUTH_SESSION_REQUIRED',
  },
  CSRF: {
    HEADER_MISSING: 'CSRF_HEADER_MISSING',
  },
  INPUT: {
    CLIENT_ERROR: 'INPUT_CLIENT_ERROR',
    INVALID_BODY: 'INPUT_INVALID_BODY',
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
} as const;

type NestedValues<T> = T extends Record<string, infer V> ? (V extends string ? V : NestedValues<V>) : never;

type ErrorCode = NestedValues<typeof ERROR_CODES>;

interface ErrorResponse {
  error: { code: ErrorCode; message: string; requestId: string };
}

function createErrorResponse(code: ErrorCode, message: string, requestId: string): ErrorResponse {
  return { error: { code, message, requestId } };
}

export { createErrorResponse, ERROR_CODES };
export type { ErrorCode, ErrorResponse };
