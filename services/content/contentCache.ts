// The on-device content cache. Each bank is stored together with its
// verified hash as one entry, so a cached bank can never be paired with
// the wrong hash. Entries that fail to parse or validate read as absent.
import { readJson, writeJson } from '../../clients/storageClient';
import { SUPPORTED_SCHEMA_VERSION } from '../../constants/appConfig';
import type { Manifest, Question } from './contentTypes';
import { validateManifest } from './validateManifest';
import { validateQuestionBank } from './validateQuestionBank';

export type CachedBank = { hash: string; questions: Question[] };

const KEY_PREFIX = 'syntactical.content.v1.';
const MANIFEST_KEY = `${KEY_PREFIX}manifest`;
const SHA256_HEX = /^[0-9a-f]{64}$/;

function buildBankKey(language: string, difficulty: string): string {
  return `${KEY_PREFIX}bank.${language}.${difficulty}`;
}

export async function readCachedManifest(): Promise<Manifest | null> {
  const result = validateManifest(await readJson<unknown>(MANIFEST_KEY, null));
  return result.isValid ? result.manifest : null;
}

export function writeCachedManifest(manifest: Manifest): Promise<boolean> {
  return writeJson(MANIFEST_KEY, manifest);
}

export async function readCachedBank(
  language: string,
  difficulty: string,
): Promise<CachedBank | null> {
  const stored = await readJson<{ hash?: unknown; questions?: unknown } | null>(
    buildBankKey(language, difficulty),
    null,
  );
  if (!stored || typeof stored.hash !== 'string' || !SHA256_HEX.test(stored.hash)) return null;
  const result = validateQuestionBank({
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    questions: stored.questions,
  });
  return result.isValid ? { hash: stored.hash, questions: result.questions } : null;
}

export function writeCachedBank(
  language: string,
  difficulty: string,
  bank: CachedBank,
): Promise<boolean> {
  return writeJson(buildBankKey(language, difficulty), bank);
}
