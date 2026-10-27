// The on-device bank cache with a budget. It shares AsyncStorage with the learner's stats, so it keeps at
// most BANK_STORE.MAX_CACHED_BANKS cached non-bundled banks (Medium, Hard) and evicts the least recently used
// before writing one more; a stats write always has room. A bundled bank (Easy) is always in the app, so a
// cached copy of it is only a newer version: it never counts toward the cap and is never evicted. The index
// key records when each cached non-bundled bank was last written or played. Every index change runs in one
// queue, so overlapping downloads cannot drop each other's entries, and a stored bank the index does not list
// (an index write that failed) counts as the least recently used.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CachedBank } from '@syntactical/content-schema';

import { logWarning } from '../../clients/logClient';
import { readJson } from '../../clients/readJson';
import { removeStoredKey } from '../../clients/removeStoredKey';
import { writeJson } from '../../clients/writeJson';
import { BANK_STORE, CONTENT_CACHE_KEYS } from '../../constants/contentCacheKeys';

import { buildBankCacheKey } from './buildBankCacheKey';
import { BUNDLED_BANKS } from './bundledBanks.generated';

type BankIndex = Record<string, number>;

let pendingChange: Promise<unknown> = Promise.resolve();

// Runs one index change after every change queued before it, whether or not that one failed.
function enqueue<T>(change: () => Promise<T>): Promise<T> {
  const run = pendingChange.then(change, change);
  pendingChange = run.catch(() => undefined);
  return run;
}

function buildBankId(language: string, difficulty: string): string {
  return `${language}/${difficulty}`;
}

function isBundled(bankId: string): boolean {
  return Object.hasOwn(BUNDLED_BANKS, bankId);
}

async function readIndex(): Promise<BankIndex> {
  const stored = await readJson<unknown>(CONTENT_CACHE_KEYS.bankIndex, {});
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
  return Object.fromEntries(
    Object.entries(stored).filter((entry): entry is [string, number] => Number.isFinite(entry[1])),
  );
}

// Adds every stored non-bundled bank the index does not list, as used at time 0.
async function addUnindexedBanks(index: BankIndex): Promise<void> {
  let keys: readonly string[];
  try {
    keys = await AsyncStorage.getAllKeys();
  } catch (err) {
    logWarning({ err: String(err) }, 'bank cache key listing failed');
    return;
  }
  for (const key of keys) {
    if (!key.startsWith(CONTENT_CACHE_KEYS.bankPrefix)) continue;
    const rest = key.slice(CONTENT_CACHE_KEYS.bankPrefix.length);
    const separator = rest.lastIndexOf('.');
    if (separator <= 0) continue;
    const bankId = buildBankId(rest.slice(0, separator), rest.slice(separator + 1));
    if (!isBundled(bankId) && !Object.hasOwn(index, bankId)) index[bankId] = 0;
  }
}

// The ids to evict, least recently used first, so that one more bank fits under the cap.
function pickEvictions(index: BankIndex, keepId: string): string[] {
  const others = Object.entries(index)
    .filter(([bankId]) => bankId !== keepId)
    .sort(([, left], [, right]) => left - right);
  const excess = others.length + 1 - BANK_STORE.MAX_CACHED_BANKS;
  return others.slice(0, Math.max(0, excess)).map(([bankId]) => bankId);
}

export function writeStoredBank(
  language: string,
  difficulty: string,
  bank: CachedBank,
  now: number = Date.now(),
): Promise<boolean> {
  const bankId = buildBankId(language, difficulty);
  const key = buildBankCacheKey(language, difficulty);
  if (isBundled(bankId)) return writeJson(key, bank);
  return enqueue(() => writeIndexedBank(bankId, key, bank, now));
}

async function writeIndexedBank(bankId: string, key: string, bank: CachedBank, now: number): Promise<boolean> {
  const index = await readIndex();
  await addUnindexedBanks(index);
  for (const evictedId of pickEvictions(index, bankId)) {
    const [evictedLanguage = '', evictedDifficulty = ''] = evictedId.split('/');
    await removeStoredKey(buildBankCacheKey(evictedLanguage, evictedDifficulty));
    delete index[evictedId];
  }
  const isWritten = await writeJson(key, bank);
  if (isWritten) index[bankId] = now;
  await writeJson(CONTENT_CACHE_KEYS.bankIndex, index);
  return isWritten;
}

export function recordBankUse(language: string, difficulty: string, now: number = Date.now()): Promise<void> {
  const bankId = buildBankId(language, difficulty);
  if (isBundled(bankId)) return Promise.resolve();
  return enqueue(async () => {
    const index = await readIndex();
    if (!Object.hasOwn(index, bankId)) return;
    index[bankId] = now;
    await writeJson(CONTENT_CACHE_KEYS.bankIndex, index);
  });
}

export async function removeRetiredBankKeys(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const retired = keys.filter((key) => key.startsWith(CONTENT_CACHE_KEYS.retiredPaidBankPrefix));
    if (retired.length > 0) await AsyncStorage.multiRemove(retired);
  } catch (err) {
    logWarning({ err: String(err) }, 'retired bank cleanup failed');
  }
}
