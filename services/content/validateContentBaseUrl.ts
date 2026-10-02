// Accepts the runtime content base URL only when it is exactly one of the
// two pinned content URLs (production and preview), so no other origin,
// protocol, credentials, path, query, or fragment can reach a fetch;
// anything else yields null, which disables content fetching.
const ALLOWED_CONTENT_BASE_URLS: readonly string[] = [
  'https://nullvoidundefined.github.io/syntactical/content/',
  'https://nullvoidundefined.github.io/syntactical/preview/content/',
];

export function validateContentBaseUrl(value: unknown): string | null {
  return typeof value === 'string' && ALLOWED_CONTENT_BASE_URLS.includes(value) ? value : null;
}
