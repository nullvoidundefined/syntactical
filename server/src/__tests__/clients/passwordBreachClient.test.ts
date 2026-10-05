// B-70 and B-71 (Task 7.3): the HTTP breach client asks the HIBP range API for one 5-character
// prefix with padding on, passes the caller's abort signal through, reads at most 256 KB of
// body, and rejects on a non-200 status or an oversized body. It never sends anything but a
// 5-character uppercase hex prefix.
import { createHash, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createHttpPasswordBreachClient } from '../../clients/passwordBreachClient.js';

const RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const MAX_RESPONSE_BYTES = 262_144;
const CHUNK_BYTES = 16_384;

interface RecordedRequest {
  init: RequestInit | undefined;
  url: string;
}

function buildPrefix(): string {
  return createHash('sha1').update(randomBytes(16)).digest('hex').toUpperCase().slice(0, 5);
}

function createRecordingFetch(respond: () => Response | Promise<Response>) {
  const requests: RecordedRequest[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push({ init, url });
    return respond();
  }) as typeof fetch;
  return { fetchImpl, requests };
}

// A body stream that never ends: a client that reads it all never settles.
function endlessStream(): ReadableStream<Uint8Array> {
  const chunk = new TextEncoder().encode('0'.repeat(CHUNK_BYTES));
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(chunk);
    },
  });
}

describe('createHttpPasswordBreachClient', () => {
  it('requests the range URL for the prefix with padding and a User-Agent, and returns the body', async () => {
    const prefix = buildPrefix();
    const body = `${'A'.repeat(35)}:1\r\n${'B'.repeat(35)}:0`;
    const { fetchImpl, requests } = createRecordingFetch(() => new Response(body, { status: 200 }));
    const client = createHttpPasswordBreachClient({ fetch: fetchImpl });
    const controller = new AbortController();

    await expect(client.fetchRange(prefix, controller.signal)).resolves.toBe(body);

    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.url).toBe(`${RANGE_URL}${prefix}`);
    const headers = new Headers(request?.init?.headers);
    expect(headers.get('Add-Padding')).toBe('true');
    expect(headers.get('User-Agent')).toBe('syntactical-api');
    expect(request?.init?.method ?? 'GET').toBe('GET');
  });

  it('passes the caller abort signal to fetch', async () => {
    const prefix = buildPrefix();
    const { fetchImpl, requests } = createRecordingFetch(() => new Response('', { status: 200 }));
    const client = createHttpPasswordBreachClient({ fetch: fetchImpl });
    const controller = new AbortController();

    await client.fetchRange(prefix, controller.signal);
    const passed = requests[0]?.init?.signal;
    expect(passed).toBeInstanceOf(AbortSignal);
    expect(passed?.aborted).toBe(false);
    controller.abort();
    expect(passed?.aborted).toBe(true);
  });

  it.each([[500], [404], [429], [301]])('rejects on status %i', async (status) => {
    const { fetchImpl } = createRecordingFetch(() => new Response('', { status }));
    const client = createHttpPasswordBreachClient({ fetch: fetchImpl });

    await expect(client.fetchRange(buildPrefix(), new AbortController().signal)).rejects.toThrow();
  });

  it('rejects when fetch rejects', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const client = createHttpPasswordBreachClient({ fetch: fetchImpl });

    await expect(client.fetchRange(buildPrefix(), new AbortController().signal)).rejects.toThrow();
  });

  it('returns a body of exactly 256 KB', async () => {
    const body = '0'.repeat(MAX_RESPONSE_BYTES);
    const { fetchImpl } = createRecordingFetch(() => new Response(body, { status: 200 }));
    const client = createHttpPasswordBreachClient({ fetch: fetchImpl });

    await expect(client.fetchRange(buildPrefix(), new AbortController().signal)).resolves.toBe(body);
  });

  it('rejects a body over 256 KB', async () => {
    const body = '0'.repeat(MAX_RESPONSE_BYTES + 1);
    const { fetchImpl } = createRecordingFetch(() => new Response(body, { status: 200 }));
    const client = createHttpPasswordBreachClient({ fetch: fetchImpl });

    await expect(client.fetchRange(buildPrefix(), new AbortController().signal)).rejects.toThrow();
  });

  it('stops reading an endless body once it passes 256 KB and rejects', async () => {
    const { fetchImpl } = createRecordingFetch(() => new Response(endlessStream(), { status: 200 }));
    const client = createHttpPasswordBreachClient({ fetch: fetchImpl });

    await expect(client.fetchRange(buildPrefix(), new AbortController().signal)).rejects.toThrow();
  }, 5_000);

  it.each([
    ['the full 40-character hash', () => createHash('sha1').update(randomBytes(16)).digest('hex').toUpperCase()],
    ['a 6-character prefix', () => buildPrefix() + 'A'],
    ['a 4-character prefix', () => buildPrefix().slice(0, 4)],
    ['a non-hex prefix', () => 'ZZZZZ'],
    ['a path traversal', () => '../..'],
    [
      'a lowercase prefix',
      () =>
        buildPrefix()
          .toLowerCase()
          .replace(/^[0-9]/, 'a'),
    ],
  ])('rejects %s without calling fetch', async (_label, buildArgument) => {
    const { fetchImpl, requests } = createRecordingFetch(() => new Response('', { status: 200 }));
    const client = createHttpPasswordBreachClient({ fetch: fetchImpl });

    await expect(client.fetchRange(buildArgument(), new AbortController().signal)).rejects.toThrow();
    expect(requests).toEqual([]);
  });
});
