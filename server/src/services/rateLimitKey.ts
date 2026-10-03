// A rate_limit_counters key: the scope plus HMAC-SHA256(RATE_LIMIT_KEY_SECRET, value), so a
// stored key reveals no email or IP and cannot be matched against a list of candidates
// without the server's secret.
import { createHmac } from 'node:crypto';

function rateLimitKey(keySecret: string, scope: string, value: string): string {
  return `${scope}:${createHmac('sha256', keySecret).update(value).digest('hex')}`;
}

export { rateLimitKey };
