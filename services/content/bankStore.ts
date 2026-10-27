// The on-device bank cache with a budget. It shares AsyncStorage with the learner's stats, so it keeps at
// most BANK_STORE.MAX_CACHED_BANKS cached non-bundled banks (Medium, Hard) and evicts the least recently used
// before writing one more; a stats write always has room. A bundled bank (Easy) is always in the app, so a
// cached copy of it is only a newer version: it never counts toward the cap and is never evicted. The index
// key records when each cached non-bundled bank was last written or played.
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

// The ids to evict, least recently used first, so that one more bank fits under the cap.
function pickEvictions(index: BankIndex, keepId: string): string[] {
  const others = Object.entries(index)
    .filter(([bankId]) => bankId !== keepId)
    .sort(([, left], [, right]) => left - right);
  const excess = others.length + 1 - BANK_STORE.MAX_CACHED_BANKS;
  return others.slice(0, Math.max(0, excess)).map(([bankId]) => bankId);
}

export async function writeStoredBank(
  language: string,
  difficulty: string,
  bank: CachedBank,
  now: number = Date.now(),
): Promise<boolean> {
  const bankId = buildBankId(language, difficulty);
  const key = buildBankCacheKey(language, difficulty);
  if (isBundled(bankId)) return writeJson(key, bank);
  const index = await readIndex();
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

export async function recordBankUse(language: string, difficulty: string, now: number = Date.now()): Promise<void> {
  const bankId = buildBankId(language, difficulty);
  if (isBundled(bankId)) return;
  const index = await readIndex();
  if (!Object.hasOwn(index, bankId)) return;
  index[bankId] = now;
  await writeJson(CONTENT_CACHE_KEYS.bankIndex, index);
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
