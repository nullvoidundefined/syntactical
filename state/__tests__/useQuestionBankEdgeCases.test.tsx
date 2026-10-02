import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createQueryClient } from '../../config/queryClient';
import { BUNDLED_MANIFEST } from '../../services/content/bundledManifest.generated';
import {
    CONTENT_BASE_URL,
    MANIFEST_URL,
    stubFetchRoutes,
} from '../../services/content/__tests__/fixtures/contentFixtures';
import { ContentProvider } from '../ContentProvider';
import { useLanguageManifest } from '../useLanguageManifest';
import { useQuestionBank } from '../useQuestionBank';

jest.mock('../../clients/hashClient', () => ({
    hashTextSha256: async (text: string) =>
        require('crypto').createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'),
}));

let queryClient: QueryClient;

function ContentWrapper({ children }: { children: ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            <ContentProvider contentBaseUrl={CONTENT_BASE_URL}>{children}</ContentProvider>
        </QueryClientProvider>
    );
}

async function settleBackgroundWork(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
    });
}

describe('useQuestionBank edge cases', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
        queryClient = createQueryClient();
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        stubFetchRoutes(
            { [MANIFEST_URL]: () => Promise.resolve(JSON.stringify(BUNDLED_MANIFEST)) },
            { shouldRejectUnrouted: true },
        );
    });

    afterEach(async () => {
        await settleBackgroundWork();
        queryClient.clear();
        jest.restoreAllMocks();
    });

    it('mounts useLanguageManifest without a TanStack missing queryFn error', async () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const { result } = await renderHook(() => useLanguageManifest(), { wrapper: ContentWrapper });

        await waitFor(() => expect(result.current).toEqual(BUNDLED_MANIFEST));
        await settleBackgroundWork();
        const errorMessages = errorSpy.mock.calls.map((callArgs) => callArgs.map(String).join(' '));
        expect(errorMessages.filter((errorMessage) => errorMessage.includes('No queryFn was passed'))).toEqual([]);
    });

    it.each(['constructor', 'toString', '__proto__'])(
        'reports unknown for the inherited object key %s used as a difficulty',
        async (inheritedKey) => {
            const { result } = await renderHook(() => useQuestionBank('python', inheritedKey), {
                wrapper: ContentWrapper,
            });

            await waitFor(() => expect(result.current?.status).toBe('unknown'));
        },
    );
});
