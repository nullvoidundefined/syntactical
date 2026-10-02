// Shared fixtures for the content loading tests: question and bank
// builders, a Node SHA-256 hasher, and a URL-routed fetch stub.
import { createHash } from 'crypto';

import { BUNDLED_MANIFEST } from '../../bundledManifest.generated';
import type { Manifest } from '../../types/Manifest';

export const CONTENT_BASE_URL = 'https://example.test/content/';
export const MANIFEST_URL = `${CONTENT_BASE_URL}manifest.json`;

export function hashUtf8Hex(text: string): string {
    return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

export async function hashTextWithNode(text: string): Promise<string> {
    return hashUtf8Hex(text);
}

export function buildBoolQuestion(id: string) {
    return {
        id,
        type: 'bool',
        prompt: `Prompt for ${id}`,
        answer: true,
        query: { title: `Title for ${id}`, explanation: `Explanation for ${id}` },
    };
}

export function buildBankText(questionIds: string[], schemaVersion = 1): string {
    return JSON.stringify({ schemaVersion, questions: questionIds.map(buildBoolQuestion) });
}

export function cloneBundledManifest(): Manifest {
    return JSON.parse(JSON.stringify(BUNDLED_MANIFEST)) as Manifest;
}

export function buildGoLanguage(easyBankHash: string) {
    return {
        id: 'go',
        label: 'Go',
        glyph: 'GO',
        tagline: 'Goroutines, interfaces, and the zero value.',
        grammar: 'go',
        banks: { easy: { path: 'go/easy.json', hash: easyBankHash } },
    };
}

export type FetchRoute = () => Promise<string>;

function buildResponse(url: string, body: string) {
    return { ok: true, status: 200, url, redirected: false, text: () => Promise.resolve(body) };
}

export type StubFetchOptions = { shouldRejectUnrouted?: boolean };

// Routes each request by its exact URL. An unrouted URL never resolves, or,
// with shouldRejectUnrouted, fails at once like an offline request, so no
// request is left waiting on the client's real timeout after a test ends.
export function stubFetchRoutes(routes: Record<string, FetchRoute>, options: StubFetchOptions = {}): jest.Mock {
    const { shouldRejectUnrouted = false } = options;
    const fetchMock = jest.fn((input: unknown) => {
        const url = String(input);
        const route = Object.prototype.hasOwnProperty.call(routes, url) ? routes[url] : undefined;
        if (!route && shouldRejectUnrouted) return Promise.reject(new TypeError('Network request failed'));
        if (!route) return new Promise(() => {});
        return route().then((body) => buildResponse(url, body));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
}

export function stubFetchResponse(response: Record<string, unknown>): jest.Mock {
    const fetchMock = jest.fn(() => Promise.resolve(response));
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
}

export function countFetchesFor(url: string): number {
    const fetchMock = global.fetch as unknown as jest.Mock;
    return fetchMock.mock.calls.filter(([input]) => String(input) === url).length;
}

export function listFetchedUrls(): string[] {
    const fetchMock = global.fetch as unknown as jest.Mock;
    return fetchMock.mock.calls.map(([input]) => String(input));
}

export function readWarningPayloads(warnSpy: jest.SpyInstance): Record<string, unknown>[] {
    return warnSpy.mock.calls.map(([payload]) => JSON.parse(String(payload)));
}
