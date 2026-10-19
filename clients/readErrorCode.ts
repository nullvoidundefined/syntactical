// The server's error code from a response body of the shape { error: { code } };
// null for any other shape.
export function readErrorCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const { error } = body as { error?: unknown };
  if (typeof error !== 'object' || error === null) return null;
  const { code } = error as { code?: unknown };
  return typeof code === 'string' ? code : null;
}
