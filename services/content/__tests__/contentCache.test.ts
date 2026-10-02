import AsyncStorage from '@react-native-async-storage/async-storage';

import { readCachedBank } from '../readCachedBank';
import { readCachedManifest } from '../readCachedManifest';
import type { Question } from '../types/Question';
import { writeCachedBank } from '../writeCachedBank';
import { writeCachedManifest } from '../writeCachedManifest';
import { buildBoolQuestion, cloneBundledManifest, hashUtf8Hex } from './fixtures/contentFixtures';

const MANIFEST_KEY = 'syntactical.content.v1.manifest';
const PYTHON_EASY_KEY = 'syntactical.content.v1.bank.python.easy';
const BANK_HASH = hashUtf8Hex('python easy bank v2');
const BANK_QUESTIONS = [buildBoolQuestion('q-1'), buildBoolQuestion('q-2')] as Question[];

describe('contentCache', () => {
    beforeEach(() => AsyncStorage.clear());
    afterEach(() => jest.restoreAllMocks());

    it('reads back a written bank and stores it with its hash as one entry under the bank key', async () => {
        const isWritten = await writeCachedBank('python', 'easy', { hash: BANK_HASH, questions: BANK_QUESTIONS });

        expect(isWritten).toBe(true);
        const storedEntry = JSON.parse((await AsyncStorage.getItem(PYTHON_EASY_KEY)) as string);
        expect(storedEntry).toMatchObject({ hash: BANK_HASH, questions: BANK_QUESTIONS });
        const cachedBank = await readCachedBank('python', 'easy');
        expect(cachedBank?.hash).toBe(BANK_HASH);
        expect(cachedBank?.questions.map((question) => question.id)).toEqual(['q-1', 'q-2']);
    });

    it('keeps banks of different languages and difficulties under separate keys', async () => {
        await writeCachedBank('python', 'easy', { hash: BANK_HASH, questions: BANK_QUESTIONS });

        expect(await readCachedBank('python', 'hard')).toBeNull();
        expect(await readCachedBank('postgres', 'easy')).toBeNull();
    });

    it('reads a bank that was never cached as absent', async () => {
        expect(await readCachedBank('python', 'easy')).toBeNull();
    });

    it('reads a truncated cached bank entry as absent', async () => {
        await AsyncStorage.setItem(PYTHON_EASY_KEY, '{"hash":"' + BANK_HASH + '","questions":[{"id":"q-');

        expect(await readCachedBank('python', 'easy')).toBeNull();
    });

    it('reads a cached bank entry with no valid questions as absent', async () => {
        await AsyncStorage.setItem(PYTHON_EASY_KEY, JSON.stringify({ hash: BANK_HASH, questions: [] }));

        expect(await readCachedBank('python', 'easy')).toBeNull();
    });

    it('reads a cached bank entry whose questions are not an array as absent', async () => {
        await AsyncStorage.setItem(PYTHON_EASY_KEY, JSON.stringify({ hash: BANK_HASH, questions: 'q-1' }));

        expect(await readCachedBank('python', 'easy')).toBeNull();
    });

    it('reads a cached bank entry with a missing or malformed hash as absent', async () => {
        await AsyncStorage.setItem(PYTHON_EASY_KEY, JSON.stringify({ questions: BANK_QUESTIONS }));
        expect(await readCachedBank('python', 'easy')).toBeNull();

        await AsyncStorage.setItem(PYTHON_EASY_KEY, JSON.stringify({ hash: 'not-a-hash', questions: BANK_QUESTIONS }));
        expect(await readCachedBank('python', 'easy')).toBeNull();
    });

    it('reports a failed bank write as false and keeps the previous cached bank', async () => {
        await writeCachedBank('python', 'easy', { hash: BANK_HASH, questions: BANK_QUESTIONS });
        jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('quota exceeded'));
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        const isWritten = await writeCachedBank('python', 'easy', {
            hash: hashUtf8Hex('another bank'),
            questions: [buildBoolQuestion('q-9')] as Question[],
        });

        expect(isWritten).toBe(false);
        expect((await readCachedBank('python', 'easy'))?.hash).toBe(BANK_HASH);
    });

    it('reads back a written manifest stored under the manifest key', async () => {
        const manifest = cloneBundledManifest();

        expect(await writeCachedManifest(manifest)).toBe(true);

        expect(JSON.parse((await AsyncStorage.getItem(MANIFEST_KEY)) as string)).toEqual(manifest);
        expect(await readCachedManifest()).toEqual(manifest);
    });

    it('reads a manifest that was never cached as absent', async () => {
        expect(await readCachedManifest()).toBeNull();
    });

    it('reads a truncated cached manifest as absent', async () => {
        await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(cloneBundledManifest()).slice(0, 80));

        expect(await readCachedManifest()).toBeNull();
    });

    it('reads a cached manifest that fails validation as absent', async () => {
        await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify({ ...cloneBundledManifest(), schemaVersion: 2 }));
        expect(await readCachedManifest()).toBeNull();

        await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify({ schemaVersion: 1, languages: [] }));
        expect(await readCachedManifest()).toBeNull();
    });
});
