// The session cookie's attributes, shared by sign-in (set) and sign-out (clear) so a cleared
// cookie always matches the one that was set: HttpOnly, SameSite=Lax, Path=/, host-only (no
// Domain), and Secure unless the app was built for NODE_ENV=test.
import type { CookieOptions } from 'express';

function sessionCookieOptions(isSecure: boolean): CookieOptions {
  return { httpOnly: true, path: '/', sameSite: 'lax', secure: isSecure };
}

export { sessionCookieOptions };
