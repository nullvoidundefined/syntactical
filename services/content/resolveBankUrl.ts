// Resolves a bank path under the content base URL. An unsafe path or one
// that escapes the base returns null and the bank is treated as unsafe.
import { isSafeBankPath } from '@syntactical/content-schema';

export function resolveBankUrl(path: string, contentBaseUrl: string): string | null {
  if (!isSafeBankPath(path)) return null;
  const base = new URL(contentBaseUrl);
  const resolved = new URL(path, base);
  const { origin, pathname } = base;
  const isContained = resolved.origin === origin && resolved.pathname.startsWith(pathname);
  return isContained ? resolved.toString() : null;
}
