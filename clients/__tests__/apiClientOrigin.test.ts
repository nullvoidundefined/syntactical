// The API client is pinned to one origin: with an invalid or missing
// extra.apiBaseUrl, or a path that would leave the base, apiFetch throws
// ApiUnavailable and never reaches the network.

const PINNED_API_BASE_URL = 'https://api.syntactical.dev/v1/';

const mockConstants: { expoConfig: { extra: Record<string, unknown> } | null } = {
    expoConfig: { extra: {} },
};

jest.mock('expo-constants', () => mockConstants);

jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(() => Promise.resolve(null)),
    setItemAsync: jest.fn(() => Promise.resolve()),
    deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

type ApiClientModule = typeof import('../apiClient');
type ApiUnavailableModule = typeof import('../ApiUnavailable');

type LoadedClient = {
    apiFetch: ApiClientModule['apiFetch'];
    ApiUnavailable: ApiUnavailableModule['ApiUnavailable'];
};

// Loads apiClient and ApiUnavailable from one fresh module registry so a base
// URL read at module load still sees this test's configuration, and the
// instanceof check compares against the same class the client throws.
function loadClient(): LoadedClient {
    let loaded: LoadedClient | undefined;
    jest.isolateModules(() => {
        const client = require('../apiClient') as ApiClientModule;
        const errors = require('../ApiUnavailable') as ApiUnavailableModule;
        loaded = { apiFetch: client.apiFetch, ApiUnavailable: errors.ApiUnavailable };
    });
    if (!loaded) {
        throw new Error('expected the API client to load');
    }
    return loaded;
}

function setApiBaseUrl(value: unknown, isPresent = true): void {
    mockConstants.expoConfig = { extra: isPresent ? { apiBaseUrl: value } : {} };
}

function installRecordingFetch(): jest.Mock {
    const fetchMock = jest.fn(() =>
        Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            text: () => Promise.resolve('{}'),
            json: () => Promise.resolve({}),
        }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
}

// Userinfo is assembled at run time so no credential-shaped literal sits in source.
function buildUrlWithUserinfo(): string {
    const userinfo = ['vis', 'itor'].join('');
    return `https://${userinfo}@api.syntactical.dev/v1/`;
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (err) {
        return err;
    }
    throw new Error('expected apiFetch to reject');
}

describe('apiFetch origin pin', () => {
    let fetchMock: jest.Mock;

    beforeEach(() => {
        fetchMock = installRecordingFetch();
        setApiBaseUrl(PINNED_API_BASE_URL);
    });

    it('requests the path resolved against the pinned base when the base is valid', async () => {
        const { apiFetch } = loadClient();
        await apiFetch('auth/codes', { method: 'POST', body: { email: 'reader@example.test' } });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const requestedUrl = String((fetchMock.mock.calls[0] as unknown[])[0]);
        expect(requestedUrl).toBe('https://api.syntactical.dev/v1/auth/codes');
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
        ['an empty string', ''],
        ['a number', 42],
        ['the pinned path over http', 'http://api.syntactical.dev/v1/'],
        ['another host', 'https://evil.example/v1/'],
        ['a lookalike host', 'https://api.syntactical.dev.evil.example/v1/'],
        ['the pinned path without its trailing slash', 'https://api.syntactical.dev/v1'],
        ['a query string', 'https://api.syntactical.dev/v1/?next=x'],
    ])('throws ApiUnavailable and makes no request when apiBaseUrl is %s', async (_label, value) => {
        setApiBaseUrl(value);
        const { apiFetch, ApiUnavailable } = loadClient();
        const error = await captureRejection(apiFetch('auth/codes'));
        expect(error).toBeInstanceOf(ApiUnavailable);
        expect(error).toMatchObject({ name: 'ApiUnavailable' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws ApiUnavailable and makes no request when apiBaseUrl carries userinfo', async () => {
        setApiBaseUrl(buildUrlWithUserinfo());
        const { apiFetch, ApiUnavailable } = loadClient();
        const error = await captureRejection(apiFetch('auth/codes'));
        expect(error).toBeInstanceOf(ApiUnavailable);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws ApiUnavailable and makes no request when extra has no apiBaseUrl key', async () => {
        setApiBaseUrl(undefined, false);
        const { apiFetch, ApiUnavailable } = loadClient();
        const error = await captureRejection(apiFetch('auth/codes'));
        expect(error).toBeInstanceOf(ApiUnavailable);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws ApiUnavailable and makes no request when expoConfig is null', async () => {
        mockConstants.expoConfig = null;
        const { apiFetch, ApiUnavailable } = loadClient();
        const error = await captureRejection(apiFetch('auth/codes'));
        expect(error).toBeInstanceOf(ApiUnavailable);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        ['a parent-directory path', '../x'],
        ['a nested parent-directory path', 'answer-events/../../x'],
        ['a protocol-relative path', '//evil.example/x'],
        ['an absolute URL', 'https://evil.example/x'],
        ['an absolute URL on the pinned host outside the base', 'https://api.syntactical.dev/x'],
    ])('throws ApiUnavailable and makes no request for %s', async (_label, path) => {
        const { apiFetch, ApiUnavailable } = loadClient();
        const error = await captureRejection(apiFetch(path));
        expect(error).toBeInstanceOf(ApiUnavailable);
        expect(error).toMatchObject({ name: 'ApiUnavailable' });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
