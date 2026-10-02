// The bank path rule: only plain lowercase relative segments ending in .json.
const SAFE_PATH = /^[a-z0-9-]+(\/[a-z0-9-]+)*\.json$/;

export function isSafeBankPath(path: unknown): boolean {
  return typeof path === 'string' && SAFE_PATH.test(path);
}
