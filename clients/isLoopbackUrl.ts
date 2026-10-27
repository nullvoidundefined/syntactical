// True for an http URL on a loopback host, any port: the only kind of API base URL the e2e build
// can carry (app.config.ts accepts no other for E2E_API_BASE_URL, and its LOOPBACK_HOSTS list must
// match this one; a test checks it). The fixture purchase store is chosen only under such a URL.
// Parsed with patterns, not URL, so it reads the same under Hermes and Node.
export const LOOPBACK_HOSTS: readonly string[] = ['127.0.0.1', 'localhost', '[::1]'];

// The authority of an http URL; no user info is allowed, so a loopback name cannot hide a host.
const HTTP_AUTHORITY = /^http:\/\/([^/?#@]+)(?:[/?#]|$)/i;
const HOST_AND_PORT = /^(\[[^\]]+\]|[^:]+)(?::\d{1,5})?$/;

export function isLoopbackUrl(value: string | null): boolean {
  if (value === null) return false;
  const authority = HTTP_AUTHORITY.exec(value)?.[1];
  const host = authority === undefined ? undefined : HOST_AND_PORT.exec(authority)?.[1];
  return host !== undefined && LOOPBACK_HOSTS.includes(host.toLowerCase());
}
