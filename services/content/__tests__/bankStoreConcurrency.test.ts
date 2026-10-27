// services/content/__tests__/bankStoreConcurrency.test.ts
// Opening a track's difficulty step downloads its Medium and Hard banks together, and the review prefetch starts
// every missing bank in one loop, so bank cache writes overlap. Overlapping writes must still keep at most six
// cached non-bundled banks, every one of them in the index, and a bank left on disk without an index entry (an
// index write that failed) counts as the least recently used and is evicted first.
import type { CachedBank, Question } from '@syntactical/content-schema';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { writeJson } from '../../../clients/writeJson';
import { BANK_STORE, CONTENT_CACHE_KEYS } from '../../../constants/contentCacheKeys';
import { recordBankUse, writeStoredBank } from '../bankStore';

import { buildBoolQuestion } from './fixtures/contentFixtures';

const SEEDED = [
  ['python', 'medium'],
  ['python', 'hard'],
  ['go', 'medium'],
  ['go', 'hard'],
  ['ruby', 'medium'],
  ['ruby', 'hard'],
] as const;
const CONCURRENT = [
  ['sql', 'medium'],
  ['nodejs', 'medium'],
  ['nodejs', 'hard'],
] as const;

function buildBank(seed: string): CachedBank {
  return { hash: 'b'.repeat(64), questions: [buildBoolQuestion(`${seed}-00`)] as Question[] };
}

async function listStoredNonBundledBankIds(): Promise<string[]> {
  const keys = await AsyncStorage.getAllKeys();
  return keys
    .filter((key) => key.startsWith(CONTENT_CACHE_KEYS.bankPrefix))
    .map((key) => key.slice(CONTENT_CACHE_KEYS.bankPrefix.length).replace('.', '/'))
    .filter((bankId) => !bankId.endsWith('/easy'))
    .sort();
}

async function readIndexIds(): Promise<string[]> {
  const stored = await AsyncStorage.getItem(CONTENT_CACHE_KEYS.bankIndex);
  return Object.keys(JSON.parse(stored ?? '{}') as Record<string, number>).sort();
}

describe('the bank cache under overlapping writes', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the cap and indexes every stored bank when three writes overlap', async () => {
    for (const [index, [language, difficulty]] of SEEDED.entries()) {
      await writeStoredBank(language, difficulty, buildBank(`${language}-${difficulty}`), index + 1);
    }

    await Promise.all([
      ...CONCURRENT.map(([language, difficulty], index) =>
        writeStoredBank(language, difficulty, buildBank(`${language}-${difficulty}`), 100 + index),
      ),
      recordBankUse('ruby', 'hard', 99),
    ]);

    const stored = await listStoredNonBundledBankIds();
    expect(stored).toHaveLength(BANK_STORE.MAX_CACHED_BANKS);
    expect(await readIndexIds()).toEqual(stored);
    expect(stored).toEqual(expect.arrayContaining(['nodejs/hard', 'nodejs/medium', 'ruby/hard', 'sql/medium']));
  });

  it('evicts a stored bank the index does not list before any indexed bank', async () => {
    for (const [index, [language, difficulty]] of SEEDED.slice(0, 5).entries()) {
      await writeStoredBank(language, difficulty, buildBank(`${language}-${difficulty}`), index + 1);
    }
    await writeJson(`${CONTENT_CACHE_KEYS.bankPrefix}sql.hard`, buildBank('sql-hard'));

    await writeStoredBank('nodejs', 'medium', buildBank('nodejs-medium'), 50);

    const stored = await listStoredNonBundledBankIds();
    expect(stored).not.toContain('sql/hard');
    expect(stored).toHaveLength(BANK_STORE.MAX_CACHED_BANKS);
    expect(await readIndexIds()).toEqual(stored);
  });
});
