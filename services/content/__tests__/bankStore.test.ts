// services/content/__tests__/bankStore.test.ts
// The bank cache shares AsyncStorage with the learner's stats, so it keeps at most six cached Medium and Hard
// banks and evicts the least recently used one before writing a seventh. A storage quota is simulated: it holds
// eight banks and a little more, so without the cap eight cached banks leave no room for a stats write, and with
// it a stats write always fits. A cached copy of a bundled Easy bank never counts and is never evicted.
import type { CachedBank, Question } from '@syntactical/content-schema';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { writeJson } from '../../../clients/writeJson';
import { STORAGE_KEY } from '../../../constants/appConfig';
import { writeCachedBank } from '../writeCachedBank';

import { buildBoolQuestion } from './fixtures/contentFixtures';

const QUESTIONS_PER_BANK = 40;
const INDEX_ALLOWANCE_BYTES = 1_000;
const NON_BUNDLED = [
  ['python', 'medium'],
  ['python', 'hard'],
  ['go', 'medium'],
  ['go', 'hard'],
  ['ruby', 'medium'],
  ['ruby', 'hard'],
  ['sql', 'medium'],
] as const;

function buildBank(seed: string): CachedBank {
  const ids = Array.from({ length: QUESTIONS_PER_BANK }, (_, index) => `${seed}-${String(index).padStart(2, '0')}`);
  return { hash: 'b'.repeat(64), questions: ids.map(buildBoolQuestion) as Question[] };
}

const BANK_BYTES = JSON.stringify(buildBank('python-medium')).length;
const STATS = { padding: 'x'.repeat(Math.floor(BANK_BYTES / 2)) };
// Room for eight banks (one bundled Easy copy and seven others) plus the bank index, but not a stats write too.
const QUOTA_BYTES = 8 * BANK_BYTES + INDEX_ALLOWANCE_BYTES;

function cacheKey(language: string, difficulty: string): string {
  return `syntactical.content.v1.bank.${language}.${difficulty}`;
}

async function countStoredBytes(exceptKey: string): Promise<number> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key !== exceptKey);
  const pairs = await AsyncStorage.multiGet(keys);
  return pairs.reduce((total, [, value]) => total + (value?.length ?? 0), 0);
}

// AsyncStorage.setItem is already a jest.fn in the mock, so spyOn returns that same function: the write goes
// through multiSet rather than a captured setItem, which would call itself.
function enforceQuota(): void {
  jest.spyOn(AsyncStorage, 'setItem').mockImplementation(async (key: string, value: string) => {
    if ((await countStoredBytes(key)) + value.length > QUOTA_BYTES) {
      throw new Error('QuotaExceededError: the storage quota has been exceeded');
    }
    return AsyncStorage.multiSet([[key, value]]);
  });
}

async function writeAt(now: number, language: string, difficulty: string): Promise<boolean> {
  jest.spyOn(Date, 'now').mockReturnValue(now);
  return writeCachedBank(language, difficulty, buildBank(`${language}-${difficulty}`));
}

describe('the bank cache budget', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    enforceQuota();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps six Medium and Hard banks, evicts the oldest, keeps the bundled Easy copy, and leaves room for stats', async () => {
    await writeAt(1, 'python', 'easy');
    for (const [index, [language, difficulty]] of NON_BUNDLED.entries()) {
      await writeAt(index + 2, language, difficulty);
    }

    expect(await writeJson(STORAGE_KEY, STATS)).toBe(true);
    expect(await AsyncStorage.getItem(cacheKey('python', 'medium'))).toBeNull();
    for (const [language, difficulty] of NON_BUNDLED.slice(1)) {
      expect(await AsyncStorage.getItem(cacheKey(language, difficulty))).not.toBeNull();
    }
    expect(await AsyncStorage.getItem(cacheKey('python', 'easy'))).not.toBeNull();
  });

  it('evicts by last use: a bank played after it was stored outlives one stored later', async () => {
    const { recordBankUse } = jest.requireActual<typeof import('../bankStore')>('../bankStore');
    for (const [index, [language, difficulty]] of NON_BUNDLED.slice(0, 6).entries()) {
      await writeAt(index + 2, language, difficulty);
    }
    await recordBankUse('python', 'medium', 10);

    await writeAt(11, 'sql', 'medium');

    expect(await AsyncStorage.getItem(cacheKey('python', 'medium'))).not.toBeNull();
    expect(await AsyncStorage.getItem(cacheKey('python', 'hard'))).toBeNull();
  });

  it('removes the retired owner-scoped paid bank caches', async () => {
    const { removeRetiredBankKeys } = jest.requireActual<typeof import('../bankStore')>('../bankStore');
    await AsyncStorage.setItem('syntactical.content.v1.paid.a6f1d1c2.python.medium', '{}');
    await AsyncStorage.setItem(cacheKey('python', 'easy'), '{}');

    await removeRetiredBankKeys();

    expect(await AsyncStorage.getAllKeys()).toEqual([cacheKey('python', 'easy')]);
  });
});
