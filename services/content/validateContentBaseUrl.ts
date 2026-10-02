// Accepts the runtime content base URL only when it is the pinned https
// origin, carries no credentials, and ends at an allowed content path;
// anything else yields null, which disables content fetching.
const ALLOWED_CONTENT_ORIGIN = 'https://nullvoidundefined.github.io';
const ALLOWED_CONTENT_PATHS = ['/syntactical/content/', '/syntactical/preview/content/'];
const REQUIRED_PROTOCOL = 'https:';

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isAllowedUrl(url: URL): boolean {
  const { origin, password, pathname, protocol, username } = url;
  return (
    protocol === REQUIRED_PROTOCOL &&
    origin === ALLOWED_CONTENT_ORIGIN &&
    username === '' &&
    password === '' &&
    ALLOWED_CONTENT_PATHS.includes(pathname)
  );
}

export function validateContentBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = parseUrl(value);
  return url !== null && isAllowedUrl(url) ? value : null;
}
