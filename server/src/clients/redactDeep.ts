const CENSOR = '[REDACTED]';
const TRUNCATED = '[Truncated]';
const MAX_DEPTH = 8;
// Any key containing one of these words is censored, so userEmail and otpCode cannot slip past.
const SENSITIVE_WORDS = ['authorization', 'cookie', 'email', 'otp', 'password', 'secret', 'token'];
// pg error payload fields, which can quote row values such as an email.
const PG_PAYLOAD_KEYS = new Set(['column', 'datatype', 'detail', 'hint', 'internalposition', 'internalquery', 'routine', 'stack', 'where']);
// Keys ending in "code" are one-time codes unless they are one of these readable codes.
const READABLE_CODE_KEYS = new Set(['pgcode', 'statuscode']);

function isSensitiveKey(key: string): boolean {
  const lowered = key.toLowerCase();
  // Every key named message is censored in any case, whatever its siblings: guessing an error
  // shape from sibling keys kept missing shapes. Log text belongs in the logger's msg instead.
  if (lowered === 'message') {
    return true;
  }
  if (PG_PAYLOAD_KEYS.has(lowered) || SENSITIVE_WORDS.some((word) => lowered.includes(word))) {
    return true;
  }
  return lowered.endsWith('code') && !READABLE_CODE_KEYS.has(lowered);
}

// An Error is logged by name, pg code, and constraint only: its message, detail, and
// stack can carry user data such as an email from a unique violation.
function summarizeError(error: Error): Record<string, unknown> {
  const { code, constraint } = error as Error & { code?: unknown; constraint?: unknown };
  return {
    constraint: typeof constraint === 'string' ? constraint : undefined,
    pgCode: typeof code === 'string' ? code : undefined,
    type: error.name,
  };
}

function isWalkable(value: unknown): value is object {
  if (Array.isArray(value)) {
    return true;
  }
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

function walkObject(value: Record<string, unknown>, depth: number, seen: WeakSet<object>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      return [key, isSensitiveKey(key) ? CENSOR : walk(item, depth + 1, seen)];
    }),
  );
}

function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value instanceof Error) {
    return summarizeError(value);
  }
  if (!isWalkable(value)) {
    return value;
  }
  if (depth > MAX_DEPTH || seen.has(value)) {
    return TRUNCATED;
  }
  seen.add(value);
  const copy = Array.isArray(value)
    ? value.map((item: unknown) => walk(item, depth + 1, seen))
    : walkObject(value as Record<string, unknown>, depth, seen);
  seen.delete(value);
  return copy;
}

// Replaces the value of every sensitive key at any depth, so a renamed parent cannot hide a secret.
function redactDeep(value: Record<string, unknown>): Record<string, unknown> {
  if (value instanceof Error) {
    return { err: summarizeError(value) };
  }
  return walk(value, 0, new WeakSet()) as Record<string, unknown>;
}

export { redactDeep };
