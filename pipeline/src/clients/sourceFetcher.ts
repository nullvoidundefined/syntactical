// Fetches a cited source page for the judged route. The URL comes from model output, so it is
// untrusted: every hop (the first URL and each redirect, at most 3) passes checkSourceUrl, every
// address its host resolves to must be public, and the connection goes to the address that was
// checked (a pinned lookup), so DNS cannot swap in a private address between check and connect.
// TLS still verifies the certificate against the hostname. The body is capped at 2 MB, only text
// and HTML are read, and the whole fetch, DNS and redirects included, shares one deadline.
import { lookup } from 'node:dns/promises';
import type { IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

import type { SourceFetchFailure, SourceFetchResult } from '../types/SourceFetchResult.js';

import { SOURCE_FETCH_LIMITS, type SourceFetchLimits } from './SOURCE_FETCH_LIMITS.js';
import { checkSourceUrl } from './checkSourceUrl.js';
import { isPublicAddress } from './isPublicAddress.js';

export type HostResolver = (hostname: string) => Promise<string[]>;

export interface SourceResponse {
    body: AsyncIterable<Uint8Array>;
    cancel: () => void;
    /** Header names are lowercase. */
    headers: Record<string, string | undefined>;
    status: number;
}

export type PinnedRequest = (url: URL, address: string, signal: AbortSignal) => Promise<SourceResponse>;

export interface SourceFetcherDeps {
    limits?: Partial<SourceFetchLimits>;
    request?: PinnedRequest;
    resolve?: HostResolver;
}

export type SourceFetcher = (rawUrl: string) => Promise<SourceFetchResult>;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const OK_STATUS = 200;
const ALLOWED_MEDIA_TYPES = ['text/html', 'text/plain', 'application/xhtml+xml'];
const HTTPS_PORT = 443;
const USER_AGENT = 'syntactical-pipeline-source-check';

function fail(reason: SourceFetchFailure): SourceFetchResult {
    return { ok: false, reason };
}

export const resolveAllAddresses: HostResolver = async (hostname) =>
    (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address);

/** A lookup that answers every query with the one address that passed the public-address check. */
export function buildPinnedLookup(address: string): LookupFunction {
    const family = isIP(address);
    return ((_hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
        if (options?.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
    }) as unknown as LookupFunction;
}

function flattenHeaders(headers: IncomingHttpHeaders): Record<string, string | undefined> {
    return Object.fromEntries(
        Object.entries(headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : value]),
    );
}

/** The production request: node:https to the pinned address, SNI and certificate checked against the hostname. */
export function createPinnedHttpsRequest(): PinnedRequest {
    return (url, address, signal) =>
        new Promise((resolve, reject) => {
            const outgoing = httpsRequest(
                {
                    // No shared agent: a pooled socket would skip the pinned lookup for this request.
                    agent: false,
                    headers: { accept: 'text/html, text/plain;q=0.9', 'user-agent': USER_AGENT },
                    host: url.hostname,
                    lookup: buildPinnedLookup(address),
                    method: 'GET',
                    path: `${url.pathname}${url.search}`,
                    port: HTTPS_PORT,
                    servername: url.hostname,
                    signal,
                },
                (incoming) =>
                    resolve({
                        body: incoming,
                        cancel: () => incoming.destroy(),
                        headers: flattenHeaders(incoming.headers),
                        status: incoming.statusCode ?? 0,
                    }),
            );
            outgoing.on('error', reject);
            outgoing.end();
        });
}

/** Settles with the promise, or rejects as soon as the signal aborts, whichever comes first. */
function raceDeadline<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
}

function readMediaType(headers: SourceResponse['headers']): string {
    return (headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

/** Reads the body up to maxBytes; returns null and cancels the response once the total exceeds it. */
async function readCappedBody(response: SourceResponse, maxBytes: number, signal: AbortSignal): Promise<Buffer | null> {
    const onAbort = () => response.cancel();
    signal.addEventListener('abort', onAbort, { once: true });
    try {
        const chunks: Uint8Array[] = [];
        let received = 0;
        for await (const chunk of response.body) {
            received += chunk.length;
            if (received > maxBytes) {
                response.cancel();
                return null;
            }
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    } catch (error) {
        response.cancel();
        throw error;
    } finally {
        signal.removeEventListener('abort', onAbort);
    }
}

async function fetchWithinDeadline(
    rawUrl: string,
    limits: SourceFetchLimits,
    request: PinnedRequest,
    resolve: HostResolver,
    signal: AbortSignal,
): Promise<SourceFetchResult> {
    let current = rawUrl;
    for (let hop = 0; hop <= limits.maxRedirects; hop += 1) {
        const checked = checkSourceUrl(current);
        if (!checked.ok) return fail(checked.reason);
        const { url } = checked;
        let addresses: string[];
        try {
            addresses = await raceDeadline(resolve(url.hostname), signal);
        } catch {
            return fail(signal.aborted ? 'timeout' : 'dns-failed');
        }
        if (addresses.length === 0) return fail('dns-failed');
        if (!addresses.every(isPublicAddress)) return fail('private-address');
        let response: SourceResponse;
        try {
            response = await raceDeadline(request(url, addresses[0] as string, signal), signal);
        } catch {
            return fail(signal.aborted ? 'timeout' : 'network');
        }
        if (REDIRECT_STATUSES.has(response.status)) {
            response.cancel();
            const location = response.headers.location;
            if (!location) return fail('bad-status');
            try {
                current = new URL(location, url).href;
            } catch {
                return fail('malformed-url');
            }
            continue;
        }
        if (response.status !== OK_STATUS) {
            response.cancel();
            return fail('bad-status');
        }
        const contentType = readMediaType(response.headers);
        if (!ALLOWED_MEDIA_TYPES.includes(contentType)) {
            response.cancel();
            return fail('content-type');
        }
        const declaredLength = Number(response.headers['content-length']);
        if (Number.isFinite(declaredLength) && declaredLength > limits.maxBytes) {
            response.cancel();
            return fail('too-large');
        }
        let body: Buffer | null;
        try {
            body = await readCappedBody(response, limits.maxBytes, signal);
        } catch {
            return fail(signal.aborted ? 'timeout' : 'network');
        }
        if (body === null) return fail('too-large');
        return { contentType, finalUrl: url.href, ok: true, text: body.toString('utf8') };
    }
    return fail('too-many-redirects');
}

export function createSourceFetcher(deps: SourceFetcherDeps = {}): SourceFetcher {
    const request = deps.request ?? createPinnedHttpsRequest();
    const resolve = deps.resolve ?? resolveAllAddresses;
    const limits: SourceFetchLimits = { ...SOURCE_FETCH_LIMITS, ...deps.limits };
    return async function fetchSource(rawUrl) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error('source fetch timed out')), limits.timeoutMs);
        try {
            return await fetchWithinDeadline(rawUrl, limits, request, resolve, controller.signal);
        } finally {
            clearTimeout(timer);
        }
    };
}
