// Downloads one bank, verifies its bytes against the manifest hash,
// validates it, and caches it only if that hash is still the current one.
// Throws on any failure so TanStack Query reports the error state.
import { ContentFetchError, fetchContentText } from '../../clients/contentClient';
import { logWarning } from '../../clients/logClient';
import { CONTENT_LIMITS } from '../../constants/appConfig';
import { writeCachedBank, type CachedBank } from './contentCache';
import type { BankEntry } from './contentTypes';
import { resolveBankUrl } from './resolveBankUrl';
import { validateQuestionBank } from './validateQuestionBank';
import { verifyBankHash } from './verifyBankHash';

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
  const { entry, contentBaseUrl, hashText } = args;
  const url = resolveBankUrl(entry.path, contentBaseUrl);
  if (!url) return rejectBank(entry.path, 'path is unsafe');
  const text = await readFetchedText(url, entry.path);
  if (!(await verifyBankHash(text, entry.hash, hashText))) {
    return rejectBank(entry.path, 'hash does not match');
  }
  return text;
}

export async function loadQuestionBank(args: LoadQuestionBankArgs): Promise<CachedBank> {
  const { language, difficulty, entry, isHashCurrent } = args;
  const text = await fetchVerifiedText(args);
  const result = validateQuestionBank(parseBankJson(text, entry.path));
  if (!result.isValid) return rejectBank(entry.path, result.rule);
  const bank = { hash: entry.hash, questions: result.questions };
  if (isHashCurrent(entry.hash)) await writeCachedBank(language, difficulty, bank);
  return bank;
}
