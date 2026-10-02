// The bank path rule: only plain lowercase relative segments ending in
// .json, resolved under the content base URL. Anything else returns null
// and the bank is treated as unsafe.
const SAFE_PATH = /^[a-z0-9-]+(\/[a-z0-9-]+)*\.json$/;

export function isSafeBankPath(path: unknown): boolean {
  return typeof path === 'string' && SAFE_PATH.test(path);
}

export function resolveBankUrl(path: string, contentBaseUrl: string): string | null {
  if (!isSafeBankPath(path)) return null;
  const base = new URL(contentBaseUrl);
  const resolved = new URL(path, base);
  const isContained = resolved.origin === base.origin && resolved.pathname.startsWith(base.pathname);
  return isContained ? resolved.toString() : null;
}
