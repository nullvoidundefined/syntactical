// Downloads one bank, verifies its bytes against the manifest hash,
// validates it, and caches it only if that hash is still the current one.
// Throws on any failure so TanStack Query reports the error state.
import { ContentFetchError } from '../../clients/ContentFetchError';
import { fetchContentText } from '../../clients/fetchContentText';
import { logWarning } from '../../clients/logClient';
import { CONTENT_LIMITS } from '../../constants/appConfig';

import { resolveBankUrl } from './resolveBankUrl';
import type { BankEntry } from './types/BankEntry';
import type { CachedBank } from './types/CachedBank';
import { validateQuestionBank } from './validateQuestionBank';
import { verifyBankHash } from './verifyBankHash';
import { writeCachedBank } from './writeCachedBank';

type LoadQuestionBankArgs = {
  language: string;
  difficulty: string;
  entry: BankEntry;
  contentBaseUrl: string;
  isHashCurrent: (hash: string) => boolean;
  hashText?: (text: string) => Promise<string>;
};

function readFetchedText(url: string, document: string): Promise<string> {
  return fetchContentText(url, CONTENT_LIMITS.bankBytes).catch((err: unknown) => {
    if (err instanceof ContentFetchError && err.reason === 'too-large') {
      return rejectBank(document, 'body exceeds the size limit');
    }
    logWarning({ document, err }, 'content fetch failed');
    throw err;
  });
}

function parseBankJson(text: string, document: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return rejectBank(document, 'body is not valid JSON');
  }
}

function rejectBank(document: string, rule: string): never {
  logWarning({ document, rule }, 'content rejected');
  throw new Error(`${document}: ${rule}`);
}

async function fetchVerifiedText(args: LoadQuestionBankArgs): Promise<string> {
  const { contentBaseUrl, entry, hashText } = args;
  const { hash, path } = entry;
  const url = resolveBankUrl(path, contentBaseUrl);
  if (!url) return rejectBank(path, 'path is unsafe');
  const text = await readFetchedText(url, path);
  if (!(await verifyBankHash(text, hash, hashText))) {
    return rejectBank(path, 'hash does not match');
  }
  return text;
}

export async function loadQuestionBank(args: LoadQuestionBankArgs): Promise<CachedBank> {
  const { difficulty, entry, isHashCurrent, language } = args;
  const { hash, path } = entry;
  const text = await fetchVerifiedText(args);
  const result = validateQuestionBank(parseBankJson(text, path));
  const { isValid } = result;
  if (!isValid) return rejectBank(path, result.rule);
  const { questions } = result;
  const bank = { hash, questions };
  if (isHashCurrent(hash)) await writeCachedBank(language, difficulty, bank);
  return bank;
}
