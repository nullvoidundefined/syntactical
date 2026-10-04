// Downloads one bank, verifies its bytes against the manifest hash,
// validates it, and caches it only if that hash is still the current one.
// A free bank comes from the static content host and is cached under the shared
// key; a paid bank comes from the API through apiFetch (with the
// signed-in session) and is cached only under its owner's key. A paid bank with
// no owner is refused before any request. Throws on any failure so TanStack
// Query reports the error state.
import { CONTENT_LIMITS, validateQuestionBank } from '@syntactical/content-schema';
import type { BankContext, BankEntry, CachedBank } from '@syntactical/content-schema';

import { ContentFetchError } from '../../clients/ContentFetchError';
import { apiFetch } from '../../clients/apiClient';
import { fetchContentText } from '../../clients/fetchContentText';
import { logWarning } from '../../clients/logClient';
import { HTTP_STATUS_OK } from '../../constants/appConfig';

import { resolveBankUrl } from './resolveBankUrl';
import { verifyBankHash } from './verifyBankHash';
import { writeCachedBank } from './writeCachedBank';

type LoadQuestionBankArgs = {
  context: BankContext;
  language: string;
  difficulty: string;
  entry: BankEntry;
  contentBaseUrl: string | null;
  isHashCurrent: (hash: string) => boolean;
  hashText?: (text: string) => Promise<string>;
  // The signed-in user a paid bank is downloaded for and cached under.
  ownerUserId?: string | null;
};

// Language and difficulty ids as the manifest allows them, so a paid bank path
// is always exactly two plain segments under the API base.
const BANK_ID_SEGMENT = /^[a-z0-9-]+$/;

function countUtf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

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

async function readPaidText(language: string, difficulty: string, document: string): Promise<string> {
  if (!BANK_ID_SEGMENT.test(language) || !BANK_ID_SEGMENT.test(difficulty)) {
    return rejectBank(document, 'bank id is unsafe');
  }
  const { body, status } = await apiFetch(`banks/${language}/${difficulty}`, { responseType: 'text' }).catch(
    (err: unknown) => {
      logWarning({ document, err }, 'paid bank fetch failed');
      throw err;
    },
  );
  if (status !== HTTP_STATUS_OK || typeof body !== 'string') {
    return rejectBank(document, `paid bank request failed with ${status}`);
  }
  if (countUtf8Bytes(body) > CONTENT_LIMITS.bankBytes) return rejectBank(document, 'body exceeds the size limit');
  return body;
}

function readBankText(args: LoadQuestionBankArgs): Promise<string> {
  const { contentBaseUrl, difficulty, entry, language, ownerUserId = null } = args;
  const { access, path } = entry;
  if (access === 'paid') {
    if (ownerUserId === null) return rejectBank(path, 'paid bank needs a signed-in owner');
    return readPaidText(language, difficulty, path);
  }
  if (contentBaseUrl === null) return rejectBank(path, 'no content base URL');
  const url = resolveBankUrl(path, contentBaseUrl);
  if (!url) return rejectBank(path, 'path is unsafe');
  return readFetchedText(url, path);
}

async function fetchVerifiedText(args: LoadQuestionBankArgs): Promise<string> {
  const { entry, hashText } = args;
  const { hash, path } = entry;
  const text = await readBankText(args);
  if (!(await verifyBankHash(text, hash, hashText))) {
    return rejectBank(path, 'hash does not match');
  }
  return text;
}

export async function loadQuestionBank(args: LoadQuestionBankArgs): Promise<CachedBank> {
  const { context, difficulty, entry, isHashCurrent, language, ownerUserId = null } = args;
  const { hash, path } = entry;
  const text = await fetchVerifiedText(args);
  const result = validateQuestionBank(parseBankJson(text, path), context);
  const { isValid } = result;
  if (!isValid) return rejectBank(path, result.rule);
  const { droppedQuestionIds, questions } = result;
  if (droppedQuestionIds.length > 0) {
    logWarning({ document: path, droppedQuestionIds }, 'content questions dropped');
  }
  const bank = { hash, questions };
  if (isHashCurrent(hash)) {
    await writeCachedBank(language, difficulty, bank, entry.access === 'paid' ? ownerUserId : null);
  }
  return bank;
}
