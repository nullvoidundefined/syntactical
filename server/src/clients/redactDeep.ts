const CENSOR = '[REDACTED]';
const TRUNCATED = '[Truncated]';
const MAX_DEPTH = 8;
const SENSITIVE_KEYS = new Set(['authorization', 'code', 'cookie', 'email', 'password', 'secret', 'set-cookie', 'token']);

function isSensitiveKey(key: string): boolean {
  const lowered = key.toLowerCase();
  return SENSITIVE_KEYS.has(lowered) || lowered.endsWith('token');
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

function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (!isWalkable(value)) {
    return value;
  }
  if (depth > MAX_DEPTH || seen.has(value)) {
    return TRUNCATED;
  }
  seen.add(value);
  const copy = Array.isArray(value)
    ? value.map((item: unknown) => walk(item, depth + 1, seen))
    : Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, isSensitiveKey(key) ? CENSOR : walk(item, depth + 1, seen)]),
      );
  seen.delete(value);
  return copy;
}

// Replaces the value of every sensitive key at any depth, so a renamed parent cannot hide a secret.
function redactDeep(value: Record<string, unknown>): Record<string, unknown> {
  return walk(value, 0, new WeakSet()) as Record<string, unknown>;
}

export { redactDeep };
