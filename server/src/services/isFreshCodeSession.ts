// Whether a session counts as a fresh sign-in by one-time code: opened by a code at most 10
// minutes ago (inclusive). A password session is never fresh, however new, so a password cannot
// vouch for itself.
import { AUTH } from '../constants/auth.js';

interface SessionAge {
  authMethod: 'code' | 'password';
  createdAt: Date;
}

function isFreshCodeSession({ authMethod, createdAt }: SessionAge, now: Date): boolean {
  return authMethod === 'code' && now.getTime() - createdAt.getTime() <= AUTH.PASSWORD.REAUTH_WINDOW_MS;
}

export { isFreshCodeSession };
