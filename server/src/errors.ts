// Machine-readable error codes; clients switch on these, never on messages.
const ERROR_CODES = {
  INPUT: {
    MALFORMED_JSON: 'INPUT_MALFORMED_JSON',
    PAYLOAD_TOO_LARGE: 'INPUT_PAYLOAD_TOO_LARGE',
  },
  ROUTING: {
    NOT_FOUND: 'ROUTING_NOT_FOUND',
  },
  SERVER: {
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
