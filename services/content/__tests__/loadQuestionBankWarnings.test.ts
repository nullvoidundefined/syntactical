import { CONTENT_LIMITS } from '@syntactical/content-schema';
import type { Question } from '@syntactical/content-schema';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { readCachedBank } from '../readCachedBank';
import { writeCachedBank } from '../writeCachedBank';
import { loadQuestionBank } from '../loadQuestionBank';
import {
    CONTENT_BASE_URL,
    EMPTY_BANK_CONTEXT,
    buildBankEntry,
    buildBankText,
    buildBoolQuestion,
    hashTextWithNode,
    hashUtf8Hex,
    readWarningPayloads,
    stubFetchRoutes,
} from './fixtures/contentFixtures';

const BANK_PATH = 'python/easy.json';
const BANK_URL = `${CONTENT_BASE_URL}${BANK_PATH}`;
const NEW_BANK_TEXT = buildBankText(['q-new-1', 'q-new-2']);
const NEW_BANK_HASH = hashUtf8Hex(NEW_BANK_TEXT);
const PREVIOUS_HASH = hashUtf8Hex('previous python easy bank');
const PREVIOUS_QUESTIONS = [buildBoolQuestion('q-previous')] as Question[];

function loadPythonEasy(bankHash: string) {
    return loadQuestionBank({
        context: EMPTY_BANK_CONTEXT,
        language: 'python',
        difficulty: 'easy',
        entry: buildBankEntry(BANK_PATH, bankHash),
        contentBaseUrl: CONTENT_BASE_URL,
        isHashCurrent: () => true,
        hashText: hashTextWithNode,
    });
}

function stubBankBody(bankText: string) {
    return stubFetchRoutes({ [BANK_URL]: () => Promise.resolve(bankText) });
}

describe('loadQuestionBank rejection warnings (B-20)', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(async () => {
        await AsyncStorage.clear();
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => jest.restoreAllMocks());

    function readContentRejectedWarnings(): Record<string, unknown>[] {
        return readWarningPayloads(warnSpy).filter((payload) => payload.message === 'content rejected');
    }

    function expectOneRejectionWarning(rulePattern: RegExp): void {
        const rejectionWarnings = readContentRejectedWarnings();
        expect(rejectionWarnings).toHaveLength(1);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(rejectionWarnings[0]).toMatchObject({ document: BANK_PATH });
        expect(String(rejectionWarnings[0].rule)).toMatch(rulePattern);
    }

    it('logs exactly one content rejected warning naming the bank path and the rule for a hash mismatch and for an oversized body, and none for a network failure', async () => {
        stubBankBody(NEW_BANK_TEXT);
        await expect(loadPythonEasy(hashUtf8Hex('some other bank text'))).rejects.toThrow();
        expectOneRejectionWarning(/hash/i);

        warnSpy.mockClear();
        const oversizedBankText = NEW_BANK_TEXT + ' '.repeat(CONTENT_LIMITS.bankBytes + 1);
        stubBankBody(oversizedBankText);
        await expect(loadPythonEasy(hashUtf8Hex(oversizedBankText))).rejects.toThrow();
        expectOneRejectionWarning(/size|large/i);

        warnSpy.mockClear();
        stubFetchRoutes({ [BANK_URL]: () => Promise.reject(new TypeError('Network request failed')) });
        await expect(loadPythonEasy(NEW_BANK_HASH)).rejects.toThrow();
        expect(readContentRejectedWarnings()).toHaveLength(0);
    });

    it('logs exactly one content rejected warning naming the bank path and the rule for a hash-matching body that is not JSON', async () => {
        await writeCachedBank('python', 'easy', { hash: PREVIOUS_HASH, questions: PREVIOUS_QUESTIONS });
        const notJsonText = '<html>Not Found</html>';
        stubBankBody(notJsonText);

        await expect(loadPythonEasy(hashUtf8Hex(notJsonText))).rejects.toThrow();

        expect((await readCachedBank('python', 'easy', EMPTY_BANK_CONTEXT))?.hash).toBe(PREVIOUS_HASH);
        expectOneRejectionWarning(/json/i);
    });
});
