// With no configured extra.apiBaseUrl, apiFetch throws ApiUnavailable and never
// reaches the network; with one, the path is appended to it.

const mockConstants: { expoConfig: { extra: Record<string, unknown> } | null } = {
    expoConfig: { extra: {} },
};

// The getter reads mockConstants at call time, after the hoisted mock factory has run.
jest.mock('expo-constants', () => ({
    __esModule: true,
    default: {
        get expoConfig() {
            return mockConstants.expoConfig;
        },
    },
}));

jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(() => Promise.resolve(null)),
    setItemAsync: jest.fn(() => Promise.resolve()),
    deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

import { ApiUnavailable } from '../ApiUnavailable';
import { apiFetch } from '../apiClient';

function installRecordingFetch(): jest.Mock {
    const fetchMock = jest.fn(() =>
        Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
}

describe('apiFetch base URL', () => {
    it('requests the path appended to the configured base', async () => {
        const fetchMock = installRecordingFetch();
        mockConstants.expoConfig = { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } };
        await apiFetch('auth/codes', { method: 'POST', body: { email: 'reader@example.test' } });
        expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe(
            'https://api.syntactical.dev/v1/auth/codes',
        );
    });

    it.each([
        ['no apiBaseUrl key', { extra: {} }],
        ['an empty apiBaseUrl', { extra: { apiBaseUrl: '' } }],
        ['no expoConfig', null],
    ])('throws ApiUnavailable and makes no request with %s', async (_label, config) => {
        const fetchMock = installRecordingFetch();
        mockConstants.expoConfig = config;
        await expect(apiFetch('auth/codes')).rejects.toBeInstanceOf(ApiUnavailable);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
