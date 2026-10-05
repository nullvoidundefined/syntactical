// The returnTo param on the sign-in and sign-up routes. It comes from the URL, so only
// a safe in-app path is ever followed or forwarded; anything else is ignored.
const RETURN_TO_MAX_LENGTH = 200;
// One leading slash, never followed by another slash or a backslash, then URL-safe characters only.
const RETURN_TO_PATTERN = /^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%?-][A-Za-z0-9._~!$&'()*+,;=:@%?/-]*)?$/;

// Where a successful sign-in goes: the returnTo param when it is a safe in-app
// path, else the menu.
export function readReturnTo(value: string | string[] | undefined): string {
  const isSafe = typeof value === 'string' && value.length <= RETURN_TO_MAX_LENGTH && RETURN_TO_PATTERN.test(value);
  return isSafe ? value : '/';
}

// A link to another auth route that carries a safe returnTo; an unsafe or absent one gives the bare path.
export function buildAuthHref(path: '/sign-in' | '/sign-up', returnTo: string | string[] | undefined): string {
  const safe = readReturnTo(returnTo);
  return safe === '/' ? path : `${path}?returnTo=${encodeURIComponent(safe)}`;
}
