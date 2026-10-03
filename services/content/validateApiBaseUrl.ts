// Accepts the runtime API base URL only when it is exactly the one pinned API
// URL, so no other origin, protocol, credentials, port, path, query, or
// fragment can reach a fetch; anything else yields null, which disables the
// API client.
const PINNED_API_BASE_URL = 'https://api.syntactical.dev/v1/';

export function validateApiBaseUrl(value: unknown): string | null {
  return value === PINNED_API_BASE_URL ? PINNED_API_BASE_URL : null;
}
