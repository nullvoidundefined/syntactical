import { CONTENT_LIMITS } from '@syntactical/content-schema';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { readCachedManifest } from '../readCachedManifest';
import { writeCachedManifest } from '../writeCachedManifest';
import { loadLanguageManifest } from '../loadLanguageManifest';
import {
    CONTENT_BASE_URL,
    MANIFEST_URL,
    buildBankEntry,
    buildGoLanguage,
    cloneBundledManifest,
    countFetchesFor,
    hashUtf8Hex,
    readWarningPayloads,
    stubFetchResponse,
    stubFetchRoutes,
} from './fixtures/contentFixtures';

function buildManifestWithGo() {
    const manifest = cloneBundledManifest();
    manifest.languages.push(buildGoLanguage(hashUtf8Hex('go easy bank')) as never);
    return manifest;
}

function stubManifestBody(manifestText: string) {
    return stubFetchRoutes({ [MANIFEST_URL]: () => Promise.resolve(manifestText) });
}

async function expectPreviousManifestStillCached(): Promise<void> {
    expect(await readCachedManifest()).toEqual(cloneBundledManifest());
}

describe('loadLanguageManifest', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(async () => {
        await AsyncStorage.clear();
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => jest.restoreAllMocks());

    it('fetches manifest.json under the content base URL, returns it, and caches it', async () => {
        const fetchedManifest = buildManifestWithGo();
        stubManifestBody(JSON.stringify(fetchedManifest));

        const loadedManifest = await loadLanguageManifest(CONTENT_BASE_URL);

        expect(loadedManifest).toEqual(fetchedManifest);
        expect(countFetchesFor(MANIFEST_URL)).toBe(1);
        expect(await readCachedManifest()).toEqual(fetchedManifest);
    });

    it('returns null for a manifest with a newer schemaVersion, keeps the previous copy, and logs one warning naming it', async () => {
        await writeCachedManifest(cloneBundledManifest());
        stubManifestBody(JSON.stringify({ ...buildManifestWithGo(), schemaVersion: 3 }));

        expect(await loadLanguageManifest(CONTENT_BASE_URL)).toBeNull();

        await expectPreviousManifestStillCached();
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(readWarningPayloads(warnSpy)[0]).toMatchObject({
            document: 'manifest.json',
            rule: 'schemaVersion is not supported',
        });
    });

    it('returns null for a manifest with an unsafe bank path and keeps the previous copy', async () => {
        await writeCachedManifest(cloneBundledManifest());
        const hostileManifest = buildManifestWithGo();
        hostileManifest.languages[3].banks.easy = buildBankEntry('../../etc/passwd.json', hashUtf8Hex('x'));
        stubManifestBody(JSON.stringify(hostileManifest));

        expect(await loadLanguageManifest(CONTENT_BASE_URL)).toBeNull();

        await expectPreviousManifestStillCached();
    });

    it('returns null for a manifest over its size limit even when its content is valid', async () => {
        await writeCachedManifest(cloneBundledManifest());
        stubManifestBody(JSON.stringify(buildManifestWithGo()) + ' '.repeat(CONTENT_LIMITS.manifestBytes + 1));

        expect(await loadLanguageManifest(CONTENT_BASE_URL)).toBeNull();

        await expectPreviousManifestStillCached();
    });

    it('returns null without throwing when the fetch fails, and keeps the previous copy', async () => {
        await writeCachedManifest(cloneBundledManifest());
        stubFetchRoutes({ [MANIFEST_URL]: () => Promise.reject(new TypeError('Network request failed')) });

        await expect(loadLanguageManifest(CONTENT_BASE_URL)).resolves.toBeNull();

        await expectPreviousManifestStillCached();
    });

    it('returns null for a redirected response and keeps the previous copy', async () => {
        await writeCachedManifest(cloneBundledManifest());
        stubFetchResponse({
            ok: true,
            status: 200,
            url: 'https://elsewhere.test/manifest.json',
            redirected: true,
            text: () => Promise.resolve(JSON.stringify(buildManifestWithGo())),
        });

        expect(await loadLanguageManifest(CONTENT_BASE_URL)).toBeNull();

        await expectPreviousManifestStillCached();
    });

    it('returns null for a manifest that is not JSON and keeps the previous copy', async () => {
        await writeCachedManifest(cloneBundledManifest());
        stubManifestBody('<html>Not Found</html>');

        expect(await loadLanguageManifest(CONTENT_BASE_URL)).toBeNull();

        await expectPreviousManifestStillCached();
    });
});
