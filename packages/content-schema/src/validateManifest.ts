// Validates a fetched manifest. Returns the typed manifest, or the first
// rule it broke so the caller can log it and keep the previous copy.
import { CONTENT_LIMITS, DIFFICULTIES, GRAMMARS, SUPPORTED_SCHEMA_VERSION } from './constants.js';

import { SHA256_HEX } from './SHA256_HEX.js';
import { isRecord } from './isRecord.js';
import { isSafeBankPath } from './isSafeBankPath.js';
import type { Manifest } from './types/Manifest.js';

const LANGUAGE_ID = /^[a-z0-9-]{1,32}$/;
const DIFFICULTY_IDS: readonly string[] = DIFFICULTIES.map((difficulty) => difficulty.id);
const GRAMMAR_IDS: readonly string[] = GRAMMARS;

type ManifestResult = { isValid: true; manifest: Manifest } | { isValid: false; rule: string };

function isDisplayText(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= CONTENT_LIMITS.displayFieldLength;
}

function findBankEntryProblem(bank: unknown): string | null {
  if (!isRecord(bank)) return 'is not an object';
  const { hash, path } = bank;
  if (typeof hash !== 'string' || !SHA256_HEX.test(hash)) return 'hash is invalid';
  return isSafeBankPath(path) ? null : 'path is unsafe';
}

function findBankProblem(banks: unknown): string | null {
  if (!isRecord(banks) || Object.keys(banks).length === 0) return 'banks is empty';
  for (const [difficulty, bank] of Object.entries(banks)) {
    if (!DIFFICULTY_IDS.includes(difficulty)) return `banks.${difficulty} is not a known difficulty`;
    const problem = findBankEntryProblem(bank);
    if (problem) return `banks.${difficulty}.${problem}`;
  }
  return null;
}

function findLanguageProblem(language: unknown): string | null {
  if (!isRecord(language)) return 'is not an object';
  const { id, label, glyph, tagline, grammar, banks } = language;
  if (typeof id !== 'string' || !LANGUAGE_ID.test(id)) return 'id is invalid';
  if (![label, glyph, tagline].every(isDisplayText)) return 'a display field is invalid';
  if (typeof grammar !== 'string' || !GRAMMAR_IDS.includes(grammar)) return 'grammar is not supported';
  return findBankProblem(banks);
}

function findLanguagesProblem(languages: unknown[]): string | null {
  const seenIds = new Set<string>();
  for (const [index, language] of languages.entries()) {
    const problem = findLanguageProblem(language);
    if (problem) return `languages[${index}].${problem}`;
    const { id } = language as { id: string };
    if (seenIds.has(id)) return `languages[${index}].id is a duplicate`;
    seenIds.add(id);
  }
  return null;
}

export function validateManifest(input: unknown): ManifestResult {
  if (!isRecord(input) || !Array.isArray(input.languages)) {
    return { isValid: false, rule: 'root shape is invalid' };
  }
  const { languages, schemaVersion } = input;
  if (schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    return { isValid: false, rule: 'schemaVersion is not supported' };
  }
  if (languages.length === 0) return { isValid: false, rule: 'languages is empty' };
  const rule = findLanguagesProblem(languages);
  if (rule) return { isValid: false, rule };
  return { isValid: true, manifest: input as unknown as Manifest };
}
