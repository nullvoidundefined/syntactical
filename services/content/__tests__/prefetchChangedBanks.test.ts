// Review Focus 4: the pipeline publishes while a learner holds an old cached free bank and is
// partway through a round. The new manifest triggers exactly one download, and the round in
// progress keeps the questions it started with.
import type { CachedBank, Manifest, Question } from '@syntactical/content-schema';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';

import { createQueryClient } from '../../../config/queryClient';
import { useQuizEngine } from '../../../state/useQuizEngine';
import { prefetchChangedBanks } from '../prefetchChangedBanks';
import { readCachedBank } from '../readCachedBank';
import type { ContentAccess } from '../types/ContentAccess';

import {
  CONTENT_BASE_URL,
  EMPTY_BANK_CONTEXT,
  buildBankText,
  buildBoolQuestion,
  buildAddedLanguage,
  cloneBundledManifest,
  countFetchesFor,
  hashUtf8Hex,
  stubFetchRoutes,
} from './fixtures/contentFixtures';

jest.mock('../../../clients/hashClient', () => ({
  hashTextSha256: async (text: string) =>
    require('crypto').createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'),
}));

const ADDED_EASY_URL = `${CONTENT_BASE_URL}fixture-lang/easy.json`;
const OLD_IDS = ['old-1', 'old-2', 'old-3'];
const NEW_IDS = ['new-1', 'new-2', 'new-3', 'new-4'];
const OLD_BANK_TEXT = buildBankText(OLD_IDS);
const NEW_BANK_TEXT = buildBankText(NEW_IDS);
const OLD_HASH = hashUtf8Hex(OLD_BANK_TEXT);
const NEW_HASH = hashUtf8Hex(NEW_BANK_TEXT);

let queryClient: QueryClient;

function buildManifestWithAddedLanguageHash(hash: string): Manifest {
  return { ...cloneBundledManifest(), languages: [buildAddedLanguage(hash)] } as unknown as Manifest;
}

function buildAccess(
  manifest: Manifest,
  cachedHash: string,
  contentBaseUrl: string | null = CONTENT_BASE_URL,
): ContentAccess {
  const cached: CachedBank = { hash: cachedHash, questions: OLD_IDS.map(buildBoolQuestion) as Question[] };
  return { baselineManifest: manifest, contentBaseUrl, readLocalBank: () => cached };
}

describe('prefetchChangedBanks', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    queryClient = createQueryClient();
  });
  afterEach(() => queryClient.clear());

  it('downloads a changed bank once while the round in progress keeps its questions', async () => {
    stubFetchRoutes({ [ADDED_EASY_URL]: async () => NEW_BANK_TEXT });
    const oldQuestions = OLD_IDS.map(buildBoolQuestion) as Question[];
    const { rerender, result } = await renderHook(
      ({ questions }: { questions: Question[] }) => useQuizEngine(questions),
      { initialProps: { questions: oldQuestions } },
    );
    const firstQuestionId = result.current.currentQuestion?.id;
    const newManifest = buildManifestWithAddedLanguageHash(NEW_HASH);
    queryClient.setQueryData(['manifest'], newManifest);
    const access = buildAccess(newManifest, OLD_HASH);

    // Two manifest refreshes land while the old bank is cached: still one download.
    prefetchChangedBanks(queryClient, newManifest, access);
    prefetchChangedBanks(queryClient, newManifest, access);
    await waitFor(async () =>
      expect((await readCachedBank('fixture-lang', 'easy', EMPTY_BANK_CONTEXT))?.hash).toBe(NEW_HASH),
    );
    const downloaded = queryClient.getQueryData<CachedBank>(['bank', 'fixture-lang', 'easy', NEW_HASH]);
    await rerender({ questions: downloaded?.questions ?? [] });

    expect(countFetchesFor(ADDED_EASY_URL)).toBe(1);
    expect(downloaded?.questions.map(({ id }) => id)).toEqual(NEW_IDS);
    expect(result.current.totalQuestions).toBe(OLD_IDS.length);
    expect(result.current.currentQuestion?.id).toBe(firstQuestionId);
    expect(OLD_IDS).toContain(firstQuestionId);
  });

  it('downloads nothing when the cached bank already has the manifest hash', async () => {
    stubFetchRoutes({ [ADDED_EASY_URL]: async () => OLD_BANK_TEXT });
    const manifest = buildManifestWithAddedLanguageHash(OLD_HASH);

    prefetchChangedBanks(queryClient, manifest, buildAccess(manifest, OLD_HASH));
    await Promise.resolve();

    expect(countFetchesFor(ADDED_EASY_URL)).toBe(0);
  });

  it('downloads nothing without a content base URL', async () => {
    stubFetchRoutes({ [ADDED_EASY_URL]: async () => NEW_BANK_TEXT });
    const manifest = buildManifestWithAddedLanguageHash(NEW_HASH);

    prefetchChangedBanks(queryClient, manifest, buildAccess(manifest, OLD_HASH, null));
    await Promise.resolve();

    expect(countFetchesFor(ADDED_EASY_URL)).toBe(0);
  });
});
