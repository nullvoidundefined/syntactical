// A breach client for tests: serves canned ranges and records each prefix it is asked for.
// startServer refuses an injected client outside NODE_ENV test.
import { AUTH } from '../constants/auth.js';
import type { PasswordBreachClient } from './passwordBreachClient.js';

interface FakeOptions {
  failure?: 'hang' | 'oversize' | 'reject' | 'status-500';
  // Range bodies keyed by uppercase prefix.
  ranges?: Record<string, string>;
}

interface FakePasswordBreachClient extends PasswordBreachClient {
  requestedPrefixes: string[];
}

function createFakePasswordBreachClient({ failure, ranges = {} }: FakeOptions = {}): FakePasswordBreachClient {
  const requestedPrefixes: string[] = [];
  return {
    fetchRange(prefix) {
      requestedPrefixes.push(prefix);
      switch (failure) {
        case 'hang':
          return new Promise<string>(() => {});
        case 'oversize':
          return Promise.resolve('0'.repeat(AUTH.BREACH_CHECK.MAX_RESPONSE_BYTES + 1));
        case 'reject':
          return Promise.reject(new Error('Breach range request failed'));
        case 'status-500':
          return Promise.reject(new Error('Breach range request failed with status 500'));
        default:
          return Promise.resolve(ranges[prefix] ?? '');
      }
    },
    requestedPrefixes,
  };
}

export { createFakePasswordBreachClient };
export type { FakePasswordBreachClient };
