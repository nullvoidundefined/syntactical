// Hardening for apiFetch on native: redirects refused, a bounded wait for the
// response and its body, every transport or session store failure surfaced as
// ApiUnavailable (with the original error as cause), a 401 that never deletes
// a newer session value and always notifies every handler, paths that cannot
// escape the pinned base, and no session value in any console output.
import { inspect } from 'node:util';

import {
    PINNED_API_BASE_URL,
    SESSION_TOKEN_KEY,
    buildFakeResponse,
    buildSessionValue,
    installFetch,
    recordedRequest,
    settle,
} from './apiTestSupport';

const mockSecureValues = new Map<string, string>();

jest.mock('expo-constants', () => ({
    expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

const mockSecureStore = {
    getItemAsync: jest.fn((key: string) => Promise.resolve(mockSecureValues.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
        mockSecureValues.set(key, value);
        return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
        mockSecureValues.delete(key);
        return Promise.resolve();
    }),
};

jest.mock('expo-secure-store', () => mockSecureStore);

// The spec fixes the timeout at 10 seconds.
const EXPECTED_TIMEOUT_MS = 10000;

type ApiClientModule = typeof import('../apiClient');
type OnUnauthorizedModule = typeof import('../onUnauthorized');
type ApiUnavailableModule = typeof import('../ApiUnavailable');
type SessionStoreModule = {
    readSessionToken: typeof import('../readSessionToken')['readSessionToken'];
    writeSessionToken: typeof import('../writeSessionToken')['writeSessionToken'];
    clearSessionToken: typeof import('../clearSessionToken')['clearSessionToken'];
};

type LoadedClient = {
    apiFetch: ApiClientModule['apiFetch'];
    onUnauthorized: OnUnauthorizedModule['onUnauthorized'];
    ApiUnavailable: ApiUnavailableModule['ApiUnavailable'];
    store: SessionStoreModule;
};

function loadClient(): LoadedClient {
    let loaded: LoadedClient | undefined;
    jest.isolateModules(() => {
        const client = require('../apiClient') as ApiClientModule;
        const unauthorized = require('../onUnauthorized') as OnUnauthorizedModule;
        const errors = require('../ApiUnavailable') as ApiUnavailableModule;
        const store: SessionStoreModule = {
            readSessionToken: (require('../readSessionToken') as typeof import('../readSessionToken')).readSessionToken,
            writeSessionToken: (require('../writeSessionToken') as typeof import('../writeSessionToken')).writeSessionToken,
            clearSessionToken: (require('../clearSessionToken') as typeof import('../clearSessionToken')).clearSessionToken,
        };
        loaded = {
            apiFetch: client.apiFetch,
            onUnauthorized: unauthorized.onUnauthorized,
            ApiUnavailable: errors.ApiUnavailable,
            store,
        };
    });
    if (!loaded) {
        throw new Error('expected the API client to load');
    }
    return loaded;
}

// A fetch whose response the test releases by hand, recording the signal.
function installDeferredFetch(): {
    fetchMock: jest.Mock;
    release: (response: unknown) => void;
} {
    let release: (response: unknown) => void = () => {
        throw new Error('expected fetch to have been called');
    };
    const fetchMock = jest.fn(
        () =>
            new Promise((resolve) => {
                release = resolve;
            }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    return { fetchMock, release: (response) => release(response) };
}

function trackSettled(promise: Promise<unknown>): {
    outcome: Promise<{ value?: unknown; error?: unknown }>;
    isSettled: () => boolean;
} {
    let isDone = false;
    const outcome = settle(promise).then((result) => {
        isDone = true;
        return result;
    });
    return { outcome, isSettled: () => isDone };
}

function flushIo(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}

function signalOf(fetchMock: jest.Mock): AbortSignal | undefined {
    return recordedRequest(fetchMock).init.signal as AbortSignal | undefined;
}

describe('apiFetch hardening on native', () => {
    beforeEach(() => {
        mockSecureValues.clear();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('redirects', () => {
        it("passes redirect: 'error' to fetch", async () => {
            const fetchMock = installFetch({ text: '{}' });
            const { apiFetch } = loadClient();

            await apiFetch('answer-events');

            expect(recordedRequest(fetchMock).init.redirect).toBe('error');
        });

        it.each([200, 401])(
            'refuses a redirected %s response with ApiUnavailable and no 401 handling',
            async (status) => {
                const sessionValue = buildSessionValue();
                mockSecureValues.set(SESSION_TOKEN_KEY, sessionValue);
                installFetch({ status, text: '{"data":{"inserted":1}}', redirected: true });
                const { apiFetch, onUnauthorized, ApiUnavailable } = loadClient();
                const handler = jest.fn();
                onUnauthorized(handler);

                const outcome = await settle(apiFetch('answer-events'));

                expect(outcome.error).toBeInstanceOf(ApiUnavailable);
                expect(outcome.value).toBeUndefined();
                expect(mockSecureValues.get(SESSION_TOKEN_KEY)).toBe(sessionValue);
                expect(handler).not.toHaveBeenCalled();
            },
        );

        it.each([
            'https://evil.example/v1/answer-events',
            'https://api.syntactical.dev/answer-events',
            'http://api.syntactical.dev/v1/answer-events',
        ])(
            'refuses a response whose url is %s with ApiUnavailable and no 401 handling',
            async (responseUrl) => {
                const sessionValue = buildSessionValue();
                mockSecureValues.set(SESSION_TOKEN_KEY, sessionValue);
                installFetch({ status: 401, text: '{}', url: responseUrl });
                const { apiFetch, onUnauthorized, ApiUnavailable } = loadClient();
                const handler = jest.fn();
                onUnauthorized(handler);

                const outcome = await settle(apiFetch('answer-events'));

                expect(outcome.error).toBeInstanceOf(ApiUnavailable);
                expect(outcome.value).toBeUndefined();
                expect(mockSecureValues.get(SESSION_TOKEN_KEY)).toBe(sessionValue);
                expect(handler).not.toHaveBeenCalled();
            },
        );
    });

    describe('timeout', () => {
        it('exports API_FETCH_TIMEOUT_MS as 10000 from constants/appConfig', () => {
            const config = require('../../constants/appConfig') as Record<string, unknown>;

            expect(config.API_FETCH_TIMEOUT_MS).toBe(EXPECTED_TIMEOUT_MS);
        });

        it('rejects with ApiUnavailable and aborts the request when no response arrives within the timeout', async () => {
            jest.useFakeTimers();
            const { fetchMock } = installDeferredFetch();
            const { apiFetch, ApiUnavailable } = loadClient();

            const tracked = trackSettled(apiFetch('answer-events'));
            await jest.advanceTimersByTimeAsync(EXPECTED_TIMEOUT_MS - 1);

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(tracked.isSettled()).toBe(false);

            await jest.advanceTimersByTimeAsync(1);
            expect(tracked.isSettled()).toBe(true);
            const outcome = await tracked.outcome;

            expect(outcome.error).toBeInstanceOf(ApiUnavailable);
            const signal = signalOf(fetchMock);
            expect(signal).toBeDefined();
            expect(signal?.aborted).toBe(true);
        });

        it('rejects with ApiUnavailable and aborts the request when the body read never finishes within the timeout', async () => {
            jest.useFakeTimers();
            const fetchMock = installFetch({ status: 200, isTextPending: true });
            const { apiFetch, ApiUnavailable } = loadClient();

            const tracked = trackSettled(apiFetch('answer-events'));
            await jest.advanceTimersByTimeAsync(EXPECTED_TIMEOUT_MS - 1);

            expect(tracked.isSettled()).toBe(false);

            await jest.advanceTimersByTimeAsync(1);
            expect(tracked.isSettled()).toBe(true);
            const outcome = await tracked.outcome;

            expect(outcome.error).toBeInstanceOf(ApiUnavailable);
            const signal = signalOf(fetchMock);
            expect(signal).toBeDefined();
            expect(signal?.aborted).toBe(true);
        });
    });

    describe('failures surface as ApiUnavailable', () => {
        it('rejects with ApiUnavailable when reading the session value from SecureStore fails', async () => {
            mockSecureStore.getItemAsync.mockImplementationOnce(() =>
                Promise.reject(new Error('keychain unavailable')),
            );
            installFetch({ text: '{}' });
            const { apiFetch, ApiUnavailable } = loadClient();

            const outcome = await settle(apiFetch('answer-events'));

            expect(outcome.error).toBeInstanceOf(ApiUnavailable);
        });

        it('rejects with ApiUnavailable when the body stream fails mid-read', async () => {
            installFetch({ status: 200, textError: new TypeError('stream reset') });
            const { apiFetch, ApiUnavailable } = loadClient();

            const outcome = await settle(apiFetch('answer-events'));

            expect(outcome.error).toBeInstanceOf(ApiUnavailable);
            expect(outcome.value).toBeUndefined();
        });

        it.each([
            ['empty', ''],
            ['non-JSON', '<html>bad gateway</html>'],
        ])('still resolves with a null body when the body is %s', async (_label, text) => {
            installFetch({ status: 200, text });
            const { apiFetch } = loadClient();

            const response = await apiFetch('answer-events');

            expect(response).toEqual({ status: 200, body: null });
        });

        it('carries the original fetch rejection as cause', async () => {
            const original = new TypeError('Network request failed');
            global.fetch = jest.fn(() => Promise.reject(original)) as unknown as typeof fetch;
            const { apiFetch, ApiUnavailable } = loadClient();

            const outcome = await settle(apiFetch('answer-events'));

            expect(outcome.error).toBeInstanceOf(ApiUnavailable);
            expect((outcome.error as { cause?: unknown }).cause).toBe(original);
        });
    });

    describe('401 handling', () => {
        it('does not delete a session value written while the 401 request was in flight', async () => {
            const firstValue = buildSessionValue();
            const secondValue = buildSessionValue();
            mockSecureValues.set(SESSION_TOKEN_KEY, firstValue);
            const { fetchMock, release } = installDeferredFetch();
            const { apiFetch, store } = loadClient();

            const pending = settle(apiFetch('answer-events'));
            await flushIo();
            expect(recordedRequest(fetchMock).headers.authorization).toBe(`Bearer ${firstValue}`);

            await store.writeSessionToken(secondValue);
            release(buildFakeResponse({ status: 401, text: '{}' }, `${PINNED_API_BASE_URL}answer-events`));
            await pending;

            expect(mockSecureValues.get(SESSION_TOKEN_KEY)).toBe(secondValue);
        });

        it('notifies every handler and resolves with 401 when deleting the stored value fails', async () => {
            mockSecureValues.set(SESSION_TOKEN_KEY, buildSessionValue());
            mockSecureStore.deleteItemAsync.mockImplementationOnce(() =>
                Promise.reject(new Error('keychain locked')),
            );
            installFetch({ status: 401, text: '{"error":{"code":"AUTH_SESSION_REQUIRED"}}' });
            const { apiFetch, onUnauthorized } = loadClient();
            const firstHandler = jest.fn();
            const secondHandler = jest.fn();
            onUnauthorized(firstHandler);
            onUnauthorized(secondHandler);

            const outcome = await settle(apiFetch('answer-events'));

            expect(outcome.error).toBeUndefined();
            expect(outcome.value).toMatchObject({ status: 401 });
            expect(firstHandler).toHaveBeenCalled();
            expect(secondHandler).toHaveBeenCalled();
        });

        it('keeps notifying the remaining handlers when one throws, and resolves with 401', async () => {
            mockSecureValues.set(SESSION_TOKEN_KEY, buildSessionValue());
            installFetch({ status: 401, text: '{}' });
            const { apiFetch, onUnauthorized } = loadClient();
            const throwingHandler = jest.fn(() => {
                throw new Error('handler failed');
            });
            const laterHandler = jest.fn();
            onUnauthorized(throwingHandler);
            onUnauthorized(laterHandler);

            const outcome = await settle(apiFetch('answer-events'));

            expect(outcome.error).toBeUndefined();
            expect(outcome.value).toMatchObject({ status: 401 });
            expect(throwingHandler).toHaveBeenCalled();
            expect(laterHandler).toHaveBeenCalled();
        });
    });

    describe('request shape', () => {
        it('sends no Content-Type header on a bodyless DELETE', async () => {
            const fetchMock = installFetch({ status: 204, text: '' });
            const { apiFetch } = loadClient();

            await apiFetch('auth/sessions/current', { method: 'DELETE' });

            const request = recordedRequest(fetchMock);
            expect(request.init.method).toBe('DELETE');
            expect(request.headers).not.toHaveProperty('content-type');
        });

        it.each([
            ['an encoded dot-dot segment', '%2e%2e/x'],
            ['a single backslash host prefix', `${String.fromCharCode(92)}evil.example/x`],
            ['a double backslash host prefix', `${String.fromCharCode(92).repeat(2)}evil.example/x`],
        ])('refuses %s with ApiUnavailable and no request', async (_label, path) => {
            const fetchMock = installFetch({ text: '{}' });
            const { apiFetch, ApiUnavailable } = loadClient();

            const outcome = await settle(apiFetch(path));

            expect(outcome.error).toBeInstanceOf(ApiUnavailable);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('requests a query-string path under the base', async () => {
            const fetchMock = installFetch({ text: '{}' });
            const { apiFetch } = loadClient();

            await apiFetch('answer-events?after=x');

            expect(recordedRequest(fetchMock).url).toBe(
                'https://api.syntactical.dev/v1/answer-events?after=x',
            );
        });
    });

    describe('console output', () => {
        it('never writes the session value to console.log, console.warn, or console.error', async () => {
            const sessionValue = buildSessionValue();
            const spies = [
                jest.spyOn(console, 'log').mockImplementation(() => {}),
                jest.spyOn(console, 'warn').mockImplementation(() => {}),
                jest.spyOn(console, 'error').mockImplementation(() => {}),
            ];
            const { apiFetch, store } = loadClient();

            await store.writeSessionToken(sessionValue);
            await store.readSessionToken();
            installFetch({ status: 200, text: '{}' });
            await settle(apiFetch('answer-events'));
            global.fetch = jest.fn(() =>
                Promise.reject(new TypeError('Network request failed')),
            ) as unknown as typeof fetch;
            await settle(apiFetch('answer-events'));
            installFetch({ status: 401, text: '{}' });
            await settle(apiFetch('answer-events'));
            mockSecureValues.set(SESSION_TOKEN_KEY, sessionValue);
            mockSecureStore.deleteItemAsync.mockImplementationOnce(() =>
                Promise.reject(new Error('keychain locked')),
            );
            await settle(apiFetch('answer-events'));
            mockSecureStore.setItemAsync.mockImplementationOnce(() =>
                Promise.reject(new Error('keychain locked')),
            );
            await settle(store.writeSessionToken(sessionValue));
            await settle(store.clearSessionToken());

            const written = spies
                .flatMap((spy) => spy.mock.calls)
                .flat()
                .map((arg) => (typeof arg === 'string' ? arg : inspect(arg, { depth: 6 })))
                .join('\n');
            expect(written).not.toContain(sessionValue);
        });
    });
});
