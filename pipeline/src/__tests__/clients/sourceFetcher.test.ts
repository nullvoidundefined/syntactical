// pipeline/src/__tests__/clients/sourceFetcher.test.ts
// The source fetcher against a local fake resolver and a local fake request: every hop is
// re-checked, every resolved address must be public, the connection uses the checked address,
// and the size, type, redirect, and time limits hold. No network.
import { EventEmitter } from 'node:events';
import type { RequestOptions } from 'node:https';
import { Readable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    buildPinnedLookup,
    createPinnedHttpsRequest,
    createSourceFetcher,
    type SourceResponse,
} from '../../clients/sourceFetcher.js';

// Any accidental fallback to real DNS or HTTPS fails locally.
const { httpsRequest } = vi.hoisted(() => ({
    httpsRequest: vi.fn(() => {
        throw new Error('unexpected real HTTPS');
    }),
}));
vi.mock('node:https', () => ({ request: httpsRequest }));
vi.mock('node:dns/promises', () => ({
    lookup: vi.fn(() => {
        throw new Error('unexpected real DNS');
    }),
}));
afterEach(() => {
    vi.useRealTimers();
    httpsRequest.mockClear();
});

const PAGE = 'https://owasp.org/Top10/A03_2021-Injection/';
const HTML = { 'content-type': 'text/html; charset=utf-8' };
const PUBLIC_IP = '93.184.216.34';
const TWO_MB = 2 * 1024 * 1024;

type Spec = { chunks?: Uint8Array[]; headers?: Record<string, string>; status: number };

function fakeResponse(spec: Spec) {
    const state = { cancelled: false, consumed: false };
    const response: SourceResponse = {
        body: (async function* () {
            state.consumed = true;
            for (const chunk of spec.chunks ?? []) yield chunk;
        })(),
        cancel: () => {
            state.cancelled = true;
        },
        headers: spec.headers ?? {},
        status: spec.status,
    };
    return { response, state };
}

function harness(routes: Record<string, Spec>, dns: Record<string, string[]> = {}, limits = {}) {
    const requested: { address: string; url: string }[] = [];
    const resolved: string[] = [];
    const states: ReturnType<typeof fakeResponse>['state'][] = [];
    const fetchSource = createSourceFetcher({
        limits,
        request: async (url, address) => {
            requested.push({ address, url: url.href });
            const spec = routes[url.href];
            if (!spec) throw new Error(`no route for ${url.href}`);
            const { response, state } = fakeResponse(spec);
            states.push(state);
            return response;
        },
        resolve: async (host) => {
            resolved.push(host);
            return dns[host] ?? [PUBLIC_IP];
        },
    });
    return { fetchSource, requested, resolved, states };
}

const text = (body: string) => [new TextEncoder().encode(body)];

describe('createSourceFetcher', () => {
    it('fetches an allowlisted https page and connects to the address it checked', async () => {
        const { fetchSource, requested } = harness({
            [PAGE]: { chunks: text('<p>Injection</p>'), headers: HTML, status: 200 },
        });
        expect(await fetchSource(PAGE)).toEqual({
            contentType: 'text/html',
            finalUrl: PAGE,
            ok: true,
            text: '<p>Injection</p>',
        });
        expect(requested).toEqual([{ address: PUBLIC_IP, url: PAGE }]);
    });

    it.each([
        ['http://owasp.org/Top10/', 'not-https'],
        ['https://localhost/', 'host-not-allowed'],
        ['https://127.0.0.1/', 'host-not-allowed'],
        ['https://169.254.169.254/latest/meta-data/', 'host-not-allowed'],
        ['https://owasp.org.evil.test/', 'host-not-allowed'],
        ['https://owasp.org@evil.test/', 'userinfo'],
        ['https://evil.test@owasp.org/', 'userinfo'],
        ['https://owasp.org:8443/', 'non-default-port'],
    ])('refuses %s as %s before any lookup or connection', async (raw, reason) => {
        const { fetchSource, requested, resolved } = harness({});
        expect(await fetchSource(raw)).toEqual({ ok: false, reason });
        expect(resolved).toEqual([]);
        expect(requested).toEqual([]);
    });

    it.each([
        [['127.0.0.1']],
        [['10.0.0.5']],
        [['169.254.169.254']],
        [['::1']],
        [[PUBLIC_IP, '10.0.0.5']],
        [['fd00::1']],
        [['172.16.0.1']],
        [['192.168.1.1']],
        [['0.0.0.0']],
        [['::']],
        [['fe80::1']],
        [['fc00::1']],
        [['100.64.0.1']],
        [['192.0.0.1']],
        [['198.18.0.1']],
        [['224.0.0.1']],
        [['240.0.0.1']],
        [['ff02::1']],
        [['64:ff9b::5db8:d822']],
        [['2001:db8::1']],
        [['::ffff:127.0.0.1']],
        [['::ffff:7f00:1']],
        [['::ffff:93.184.216.34']],
        [['::ffff:5db8:d822']],
    ])('refuses an allowlisted host resolving to %j without connecting', async (addresses) => {
        const { fetchSource, requested } = harness(
            { [PAGE]: { headers: HTML, status: 200 } },
            { 'owasp.org': addresses },
        );
        expect(await fetchSource(PAGE)).toEqual({ ok: false, reason: 'private-address' });
        expect(requested).toEqual([]);
    });

    it('refuses a host whose lookup fails or returns nothing', async () => {
        const empty = harness({}, { 'owasp.org': [] });
        expect(await empty.fetchSource(PAGE)).toEqual({ ok: false, reason: 'dns-failed' });
        const failing = createSourceFetcher({
            request: async () => {
                throw new Error('unused');
            },
            resolve: async () => {
                throw new Error('ENOTFOUND');
            },
        });
        expect(await failing(PAGE)).toEqual({ ok: false, reason: 'dns-failed' });
    });

    it('re-checks a redirect to a private IP literal', async () => {
        const { fetchSource, requested } = harness({
            [PAGE]: { headers: { location: 'https://127.0.0.1/admin' }, status: 302 },
        });
        expect(await fetchSource(PAGE)).toEqual({ ok: false, reason: 'host-not-allowed' });
        expect(requested).toHaveLength(1);
    });

    it('re-checks a redirect to an allowlisted host that resolves to a private address', async () => {
        const target = 'https://developer.mozilla.org/x';
        const { fetchSource, requested } = harness(
            { [PAGE]: { headers: { location: target }, status: 301 }, [target]: { headers: HTML, status: 200 } },
            { 'developer.mozilla.org': ['10.0.0.1'] },
        );
        expect(await fetchSource(PAGE)).toEqual({ ok: false, reason: 'private-address' });
        expect(requested).toHaveLength(1);
    });

    it.each([
        ['http://owasp.org/x', 'not-https'],
        ['https://owasp.org.evil.test/', 'host-not-allowed'],
        ['https://owasp.org@evil.test/', 'userinfo'],
        ['https://evil.test@owasp.org/', 'userinfo'],
        ['https://owasp.org:8443/', 'non-default-port'],
    ])('re-checks a redirect to %s', async (location, reason) => {
        const { fetchSource, requested, resolved } = harness({ [PAGE]: { headers: { location }, status: 307 } });
        expect(await fetchSource(PAGE)).toEqual({ ok: false, reason });
        expect(requested).toHaveLength(1);
        expect(resolved).toEqual(['owasp.org']);
    });

    it('re-checks a later redirect hop instead of trusting an earlier public resolution', async () => {
        let resolutions = 0;
        const requested: string[] = [];
        const fetchSource = createSourceFetcher({
            resolve: async () => (++resolutions === 3 ? ['10.0.0.1'] : [PUBLIC_IP]),
            request: async (url) => {
                requested.push(url.href);
                return fakeResponse({ status: 302, headers: { location: `/hop/${requested.length}` } }).response;
            },
        });
        expect(await fetchSource(PAGE)).toEqual({ ok: false, reason: 'private-address' });
        expect(requested).toEqual([PAGE, 'https://owasp.org/hop/1']);
    });

    it('follows a relative redirect on the same host', async () => {
        const target = 'https://owasp.org/Top10/A03/';
        const { fetchSource } = harness({
            [PAGE]: { headers: { location: '/Top10/A03/' }, status: 308 },
            [target]: { chunks: text('ok'), headers: HTML, status: 200 },
        });
        expect(await fetchSource(PAGE)).toMatchObject({ finalUrl: target, ok: true });
    });

    it('follows three redirects and refuses a fourth', async () => {
        const hop = (index: number) => `https://owasp.org/hop/${index}`;
        const routes: Record<string, Spec> = { [PAGE]: { headers: { location: hop(1) }, status: 302 } };
        for (let index = 1; index <= 3; index += 1)
            routes[hop(index)] = { headers: { location: hop(index + 1) }, status: 302 };
        routes[hop(4)] = { chunks: text('end'), headers: HTML, status: 200 };
        const tooMany = harness(routes);
        expect(await tooMany.fetchSource(PAGE)).toEqual({ ok: false, reason: 'too-many-redirects' });
        expect(tooMany.requested).toHaveLength(4);
        const threeHops = harness({ ...routes, [hop(3)]: { chunks: text('end'), headers: HTML, status: 200 } });
        expect(await threeHops.fetchSource(PAGE)).toMatchObject({ finalUrl: hop(3), ok: true });
    });

    it('refuses a redirect with no location', async () => {
        const { fetchSource } = harness({ [PAGE]: { status: 302 } });
        expect(await fetchSource(PAGE)).toEqual({ ok: false, reason: 'bad-status' });
    });

    it('caps the body at 2 MB without a content-length and cancels the response', async () => {
        const chunk = new Uint8Array(64 * 1024);
        const chunks = Array.from({ length: TWO_MB / chunk.length }, () => chunk);
        const exact = harness({ [PAGE]: { chunks, headers: HTML, status: 200 } });
        expect(await exact.fetchSource(PAGE)).toMatchObject({ ok: true });
        const over = harness({ [PAGE]: { chunks: [...chunks, new Uint8Array(1)], headers: HTML, status: 200 } });
        expect(await over.fetchSource(PAGE)).toEqual({ ok: false, reason: 'too-large' });
        expect(over.states[0]?.cancelled).toBe(true);
    });

    it('refuses a declared content-length over 2 MB without reading the body', async () => {
        const { fetchSource, states } = harness({
            [PAGE]: { chunks: text('x'), headers: { ...HTML, 'content-length': '3000000' }, status: 200 },
        });
        expect(await fetchSource(PAGE)).toEqual({ ok: false, reason: 'too-large' });
        expect(states[0]?.consumed).toBe(false);
        expect(states[0]?.cancelled).toBe(true);
    });

    it.each([['application/json'], ['image/png'], [undefined]])('refuses content type %j', async (contentType) => {
        const headers = contentType === undefined ? {} : { 'content-type': contentType };
        const { fetchSource, states } = harness({ [PAGE]: { chunks: text('{}'), headers, status: 200 } });
        expect(await fetchSource(PAGE)).toEqual({ ok: false, reason: 'content-type' });
        expect(states[0]?.consumed).toBe(false);
    });

    it.each([['text/plain'], ['application/xhtml+xml'], ['TEXT/HTML; charset=UTF-8']])(
        'accepts content type %s',
        async (contentType) => {
            const { fetchSource } = harness({
                [PAGE]: { chunks: text('body'), headers: { 'content-type': contentType }, status: 200 },
            });
            expect((await fetchSource(PAGE)).ok).toBe(true);
        },
    );

    it.each([404, 500, 204])('refuses status %i', async (status) => {
        const { fetchSource } = harness({ [PAGE]: { headers: HTML, status } });
        expect(await fetchSource(PAGE)).toEqual({ ok: false, reason: 'bad-status' });
    });

    it('times out a request that never answers', async () => {
        const fetchSource = createSourceFetcher({
            limits: { timeoutMs: 50 },
            request: (_url, _address, signal) =>
                new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))),
            resolve: async () => [PUBLIC_IP],
        });
        expect(await fetchSource(PAGE)).toEqual({ ok: false, reason: 'timeout' });
    });

    it('reports a connection error as network', async () => {
        const fetchSource = createSourceFetcher({
            request: async () => {
                throw new Error('ECONNRESET');
            },
            resolve: async () => [PUBLIC_IP],
        });
        expect(await fetchSource(PAGE)).toEqual({ ok: false, reason: 'network' });
    });
});

describe('buildPinnedLookup', () => {
    type Lookup = (host: string, options: object, callback: (...args: unknown[]) => void) => void;

    it('answers every lookup with the pinned address, in both callback forms', () => {
        const lookup = buildPinnedLookup(PUBLIC_IP) as unknown as Lookup;
        const single: unknown[] = [];
        lookup('owasp.org', {}, (...args) => single.push(...args));
        expect(single).toEqual([null, PUBLIC_IP, 4]);
        const all: unknown[] = [];
        lookup('owasp.org', { all: true }, (...args) => all.push(...args));
        expect(all).toEqual([null, [{ address: PUBLIC_IP, family: 4 }]]);
    });

    it('reports family 6 for an IPv6 address', () => {
        const lookup = buildPinnedLookup('2606:4700::6810:84e5') as unknown as Lookup;
        const single: unknown[] = [];
        lookup('owasp.org', {}, (...args) => single.push(...args));
        expect(single).toEqual([null, '2606:4700::6810:84e5', 6]);
    });
});

describe('createPinnedHttpsRequest', () => {
    it('pins the actual HTTPS lookup to the checked IP and uses the hostname as TLS servername', async () => {
        let options: RequestOptions | undefined;
        httpsRequest.mockImplementationOnce(((received: RequestOptions, respond: (body: Readable) => void) => {
            options = received;
            const outgoing = Object.assign(new EventEmitter(), {
                end: () => {
                    const incoming = Object.assign(Readable.from([Buffer.from('page')]), {
                        statusCode: 200,
                        headers: HTML,
                    });
                    respond(incoming);
                },
            });
            return outgoing;
        }) as unknown as typeof httpsRequest);
        const response = await createPinnedHttpsRequest()(new URL(PAGE), PUBLIC_IP, new AbortController().signal);
        expect(options?.servername).toBe('owasp.org');
        expect(options?.host ?? options?.hostname).toBe('owasp.org');
        expect(options?.rejectUnauthorized).not.toBe(false);
        expect(options?.lookup).toBeTypeOf('function');
        const lookup = options?.lookup as unknown as (
            host: string,
            options: object,
            callback: (...args: unknown[]) => void,
        ) => void;
        const answer: unknown[] = [];
        lookup('owasp.org', {}, (...args) => answer.push(...args));
        expect(answer).toEqual([null, PUBLIC_IP, 4]);
        const chunks: Uint8Array[] = [];
        for await (const chunk of response.body) chunks.push(chunk);
        expect(Buffer.concat(chunks).toString()).toBe('page');
    });
});

describe('whole-fetch deadline', () => {
    it('times out after 50 ms even while DNS never answers', async () => {
        const fetchSource = createSourceFetcher({
            limits: { timeoutMs: 50 },
            resolve: () => new Promise(() => {}),
            request: async () => {
                throw new Error('must not connect');
            },
        });
        expect(await fetchSource(PAGE)).toEqual({ ok: false, reason: 'timeout' });
    });

    it('times out and cancels a response whose body stalls', async () => {
        let cancelled = false;
        const fetchSource = createSourceFetcher({
            limits: { timeoutMs: 50 },
            resolve: async () => [PUBLIC_IP],
            request: async (_url, _address, signal) => ({
                headers: HTML,
                status: 200,
                cancel: () => {
                    cancelled = true;
                },
                body: (async function* () {
                    yield new Uint8Array([65]);
                    await new Promise((_resolve, reject) =>
                        signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
                    );
                })(),
            }),
        });
        expect(await fetchSource(PAGE)).toEqual({ ok: false, reason: 'timeout' });
        expect(cancelled).toBe(true);
    });

    it('shares a single 50 ms deadline across redirect hops', async () => {
        vi.useFakeTimers();
        let aborted = false;
        const fetchSource = createSourceFetcher({
            limits: { timeoutMs: 50 },
            resolve: async () => [PUBLIC_IP],
            request: (url, _address, signal) =>
                new Promise((resolve, reject) => {
                    const timer = setTimeout(
                        () =>
                            resolve(
                                fakeResponse(
                                    url.href === PAGE
                                        ? { status: 302, headers: { location: '/final' } }
                                        : { status: 200, headers: HTML, chunks: text('page') },
                                ).response,
                            ),
                        30,
                    );
                    signal.addEventListener(
                        'abort',
                        () => {
                            aborted = true;
                            clearTimeout(timer);
                            reject(signal.reason);
                        },
                        { once: true },
                    );
                }),
        });
        const result = fetchSource(PAGE);
        await vi.advanceTimersByTimeAsync(60);
        expect(await result).toEqual({ ok: false, reason: 'timeout' });
        expect(aborted).toBe(true);
    });
});
