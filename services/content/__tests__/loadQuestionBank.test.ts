import { CONTENT_LIMITS } from '@syntactical/content-schema';
import type { Question } from '@syntactical/content-schema';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { readCachedBank } from '../readCachedBank';
import { writeCachedBank } from '../writeCachedBank';
import { loadQuestionBank } from '../loadQuestionBank';
import {
    CONTENT_BASE_URL,
    buildBankText,
    buildBoolQuestion,
    countFetchesFor,
    hashTextWithNode,
    hashUtf8Hex,
    readWarningPayloads,
    stubFetchResponse,
    stubFetchRoutes,
} from './fixtures/contentFixtures';

const BANK_PATH = 'python/easy.json';
const BANK_URL = `${CONTENT_BASE_URL}${BANK_PATH}`;
const NEW_BANK_TEXT = buildBankText(['q-new-1', 'q-new-2']);
const NEW_BANK_HASH = hashUtf8Hex(NEW_BANK_TEXT);
const PREVIOUS_HASH = hashUtf8Hex('previous python easy bank');
const PREVIOUS_QUESTIONS = [buildBoolQuestion('q-previous')] as Question[];

function loadPythonEasy(bankHash: string, overrides: { path?: string; isHashCurrent?: (hash: string) => boolean } = {}) {
    return loadQuestionBank({
        language: 'python',
        difficulty: 'easy',
        entry: { path: overrides.path ?? BANK_PATH, hash: bankHash },
        contentBaseUrl: CONTENT_BASE_URL,
        isHashCurrent: overrides.isHashCurrent ?? (() => true),
        hashText: hashTextWithNode,
    });
}

function stubBankBody(bankText: string) {
    return stubFetchRoutes({ [BANK_URL]: () => Promise.resolve(bankText) });
}

async function cachePreviousBank(): Promise<void> {
    await writeCachedBank('python', 'easy', { hash: PREVIOUS_HASH, questions: PREVIOUS_QUESTIONS });
}

async function expectPreviousBankStillCached(): Promise<void> {
    const cachedBank = await readCachedBank('python', 'easy');
    expect(cachedBank?.hash).toBe(PREVIOUS_HASH);
    expect(cachedBank?.questions.map((question) => question.id)).toEqual(['q-previous']);
}

describe('loadQuestionBank', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(async () => {
        await AsyncStorage.clear();
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('fetches a verified, valid bank once, returns it, and caches it with its hash', async () => {
        stubBankBody(NEW_BANK_TEXT);

        const loadedBank = await loadPythonEasy(NEW_BANK_HASH);

        expect(loadedBank.hash).toBe(NEW_BANK_HASH);
        expect(loadedBank.questions.map((question) => question.id)).toEqual(['q-new-1', 'q-new-2']);
        expect(countFetchesFor(BANK_URL)).toBe(1);
        const cachedBank = await readCachedBank('python', 'easy');
        expect(cachedBank?.hash).toBe(NEW_BANK_HASH);
        expect(cachedBank?.questions.map((question) => question.id)).toEqual(['q-new-1', 'q-new-2']);
    });

    it('rejects a bank whose bytes do not match the manifest hash and does not cache it', async () => {
        await cachePreviousBank();
        stubBankBody(NEW_BANK_TEXT);

        await expect(loadPythonEasy(hashUtf8Hex('some other bank text'))).rejects.toThrow();

        await expectPreviousBankStillCached();
    });

    it('rejects a bank with a newer schemaVersion, keeps the previous copy, and logs one warning naming it', async () => {
        await cachePreviousBank();
        const newerBankText = buildBankText(['q-new-1'], 2);
        stubBankBody(newerBankText);

        await expect(loadPythonEasy(hashUtf8Hex(newerBankText))).rejects.toThrow();

        await expectPreviousBankStillCached();
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(readWarningPayloads(warnSpy)[0]).toMatchObject({
            document: BANK_PATH,
            rule: 'schemaVersion is not supported',
        });
    });

    it('rejects a bank with zero valid questions, keeps the previous copy, and logs one warning naming the rule', async () => {
        await cachePreviousBank();
        const invalidQuestionsText = JSON.stringify({ schemaVersion: 1, questions: [{ id: 'BAD ID', type: 'bool' }] });
        stubBankBody(invalidQuestionsText);

        await expect(loadPythonEasy(hashUtf8Hex(invalidQuestionsText))).rejects.toThrow();

        await expectPreviousBankStillCached();
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(readWarningPayloads(warnSpy)[0]).toMatchObject({ document: BANK_PATH, rule: 'no valid questions' });
    });

    it('rejects a bank over its size limit even when its hash and content are valid', async () => {
        await cachePreviousBank();
        const oversizedBankText = NEW_BANK_TEXT + ' '.repeat(CONTENT_LIMITS.bankBytes + 1);
        stubBankBody(oversizedBankText);

        await expect(loadPythonEasy(hashUtf8Hex(oversizedBankText))).rejects.toThrow();

        await expectPreviousBankStillCached();
    });

    it('rejects a failed fetch and keeps the previous copy', async () => {
        await cachePreviousBank();
        stubFetchRoutes({ [BANK_URL]: () => Promise.reject(new TypeError('Network request failed')) });

        await expect(loadPythonEasy(NEW_BANK_HASH)).rejects.toThrow();

        await expectPreviousBankStillCached();
    });

    it('rejects a redirected response and keeps the previous copy', async () => {
        await cachePreviousBank();
        stubFetchResponse({
            ok: true,
            status: 200,
            url: 'https://elsewhere.test/python/easy.json',
            redirected: true,
            text: () => Promise.resolve(NEW_BANK_TEXT),
        });

        await expect(loadPythonEasy(NEW_BANK_HASH)).rejects.toThrow();

        await expectPreviousBankStillCached();
    });

    it('rejects a fetch that does not finish within the timeout and keeps the previous copy', async () => {
        await cachePreviousBank();
        jest.useFakeTimers();

        const pendingLoad = loadPythonEasy(NEW_BANK_HASH);
        const rejection = expect(pendingLoad).rejects.toThrow();
        await jest.advanceTimersByTimeAsync(CONTENT_LIMITS.fetchTimeoutMs + 1);
        await rejection;

        jest.useRealTimers();
        await expectPreviousBankStillCached();
    });

    it('refuses an unsafe bank path without making any request', async () => {
        stubBankBody(NEW_BANK_TEXT);

        await expect(loadPythonEasy(NEW_BANK_HASH, { path: '../secrets.json' })).rejects.toThrow();
        await expect(loadPythonEasy(NEW_BANK_HASH, { path: 'https://elsewhere.test/python/easy.json' })).rejects.toThrow();

        expect((global.fetch as unknown as jest.Mock).mock.calls).toHaveLength(0);
        expect(await readCachedBank('python', 'easy')).toBeNull();
    });

    it('returns a bank whose manifest hash is no longer current without caching it', async () => {
        await cachePreviousBank();
        stubBankBody(NEW_BANK_TEXT);

        const loadedBank = await loadPythonEasy(NEW_BANK_HASH, { isHashCurrent: () => false });

        expect(loadedBank.hash).toBe(NEW_BANK_HASH);
        await expectPreviousBankStillCached();
    });

    it('does not cache a bank when the current manifest names a different hash', async () => {
        stubBankBody(NEW_BANK_TEXT);
        const currentHashes = new Set([PREVIOUS_HASH]);

        await loadPythonEasy(NEW_BANK_HASH, { isHashCurrent: (hash) => currentHashes.has(hash) });

        expect(await readCachedBank('python', 'easy')).toBeNull();
    });
});
