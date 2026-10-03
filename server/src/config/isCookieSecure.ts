// Whether the session cookie carries Secure: everywhere except NODE_ENV=test (owner policy
// 2026-10-03). Browsers accept Secure cookies from http://localhost, so development keeps it.
import type { Env } from './env.js';

function isCookieSecure(nodeEnv: Env['NODE_ENV']): boolean {
  return nodeEnv !== 'test';
}

export { isCookieSecure };
