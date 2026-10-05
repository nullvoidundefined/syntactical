// The HIBP range API behind an interface so the breach check can be tested without the network.
// The caller sends only a 5-character SHA-1 prefix; this client refuses anything else, bounds the
// body it reads, and rejects on any status but 200.
import { AUTH } from '../constants/auth.js';

const RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const PREFIX_PATTERN = /^[0-9A-F]{5}$/;

interface PasswordBreachClient {
  fetchRange(prefix: string, signal: AbortSignal): Promise<string>;
}

interface HttpClientDeps {
  fetch?: typeof fetch;
}

async function readBoundedBody(response: Response): Promise<string> {
  const { body } = response;
  if (body === null) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > AUTH.BREACH_CHECK.MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('Breach range response too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function createHttpPasswordBreachClient({ fetch: fetchImpl }: HttpClientDeps = {}): PasswordBreachClient {
  return {
    async fetchRange(prefix, signal) {
      if (!PREFIX_PATTERN.test(prefix)) throw new Error('Breach range prefix must be 5 uppercase hex characters');
      const response = await (fetchImpl ?? fetch)(`${RANGE_URL}${prefix}`, {
        headers: { 'Add-Padding': 'true', 'User-Agent': 'syntactical-api' },
        method: 'GET',
        // A redirect could carry the prefix to another host.
        redirect: 'error',
        signal,
      });
      if (response.status !== 200) {
        await response.body?.cancel();
        throw new Error(`Breach range request failed with status ${response.status}`);
      }
      return readBoundedBody(response);
    },
  };
}

export { createHttpPasswordBreachClient };
export type { PasswordBreachClient };
