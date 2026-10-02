import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadLanguageManifest } from '../loadLanguageManifest';
import { CONTENT_BASE_URL, MANIFEST_URL, readWarningPayloads, stubFetchRoutes } from './fixtures/contentFixtures';

describe('loadLanguageManifest offline', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(async () => {
        await AsyncStorage.clear();
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => jest.restoreAllMocks());

    it('logs no content rejected warning when the manifest fetch fails offline', async () => {
        stubFetchRoutes({ [MANIFEST_URL]: () => Promise.reject(new TypeError('Network request failed')) });

        await expect(loadLanguageManifest(CONTENT_BASE_URL)).resolves.toBeNull();

        const rejectionWarnings = readWarningPayloads(warnSpy).filter(
            (payload) => payload.message === 'content rejected',
        );
        expect(rejectionWarnings).toHaveLength(0);
    });
});
