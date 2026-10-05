// Hard limits on one source fetch: body size, redirect hops (each re-checked), and the time for
// the whole fetch, DNS and redirects included.
const BYTES_PER_MEBIBYTE = 1024 * 1024;

export type SourceFetchLimits = { maxBytes: number; maxRedirects: number; timeoutMs: number };

export const SOURCE_FETCH_LIMITS = { maxBytes: 2 * BYTES_PER_MEBIBYTE, maxRedirects: 3, timeoutMs: 10_000 } as const;
