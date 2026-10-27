// services/content/__tests__/prefetchReviewBanks.test.ts
// The banks a learner's due reviews come from are downloaded when the device has no copy, so a review of a
// Medium or Hard question is never skipped for lack of its bank. Due-ness comes from the answer event log alone.
// A bank the device has, a bank the manifest no longer lists, and a bank with nothing due are not fetched. A bank
// whose download failed is not asked for again until REVIEW_BANK_RETRY_MS has passed, so an offline device or a
// hash mismatch does not refetch on every coarse clock tick.
import type { CachedBank, Manifest, Question } from '@syntactical/content-schema';
import type { AnswerEvent } from '@syntactical/progress';
import type { QueryClient } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react-native';

import { createQueryClient } from '../../../config/queryClient';
import { settle } from '../../../config/settle';
import { listDueReviewBankKeys } from '../../review/listDueReviewBankKeys';
import { REVIEW_BANK_RETRY_MS, prefetchReviewBanks } from '../prefetchReviewBanks';
import type { ContentAccess } from '../types/ContentAccess';

import {
  CONTENT_BASE_URL,
  buildBankText,
  buildBoolQuestion,
  cloneBundledManifest,
  countFetchesFor,
  hashUtf8Hex,
  listFetchedUrls,
  stubFetchRoutes,
} from './fixtures/contentFixtures';

jest.mock('../../../clients/hashClient', () => ({
  hashTextSha256: async (text: string) =>
    require('crypto').createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'),
}));

const MEDIUM_URL = `${CONTENT_BASE_URL}python/medium.json`;
const HARD_URL = `${CONTENT_BASE_URL}python/hard.json`;
const MEDIUM_TEXT = buildBankText(['py-medium-1', 'py-medium-2']);
const ANSWERED_AT = '2026-10-01T09:00:00.000Z';
const MONTH_LATER = new Date('2026-11-01T09:00:00.000Z');

let queryClient: QueryClient;

function buildEvent(serial: number, bankKey: string, questionId: string, isCorrect: boolean): AnswerEvent {
  const eventId = `00000000-0000-4000-8000-${String(serial).padStart(12, '0')}`;
  return { answeredAt: ANSWERED_AT, bankKey, choiceIndex: 0, eventId, isCorrect, questionId, roundKind: 'bank' };
}

function buildManifest(): Manifest {
  const manifest = cloneBundledManifest();
  const python = manifest.languages.find(({ id }) => id === 'python')!;
  python.banks.medium = { ...python.banks.medium!, hash: hashUtf8Hex(MEDIUM_TEXT) };
  return { ...manifest, languages: [python] };
}

function buildAccess(manifest: Manifest, localBanks: Record<string, CachedBank>): ContentAccess {
  return {
    baselineManifest: manifest,
    contentBaseUrl: CONTENT_BASE_URL,
    readLocalBank: (language, difficulty) => localBanks[`${language}/${difficulty}`] ?? null,
  };
}

describe('listDueReviewBankKeys', () => {
  it('names the bank of every missed question that is due, once each, and no bank answered only correctly', () => {
    const events = [
      buildEvent(1, 'python/medium', 'medium-q-1', false),
      buildEvent(2, 'python/medium', 'medium-q-2', false),
      buildEvent(3, 'go/hard', 'hard-q-1', false),
      buildEvent(4, 'python/easy', 'easy-q-1', true),
    ];

    expect(listDueReviewBankKeys(events, MONTH_LATER)).toEqual(['go/hard', 'python/medium']);
  });

  it('names nothing before a missed question comes due', () => {
    const events = [buildEvent(1, 'python/medium', 'medium-q-1', false)];

    expect(listDueReviewBankKeys(events, new Date(ANSWERED_AT))).toEqual([]);
  });
});

describe('prefetchReviewBanks', () => {
  beforeEach(() => {
    queryClient = createQueryClient();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    await settle();
    queryClient.clear();
    jest.restoreAllMocks();
  });

  it('downloads a due bank with no local copy and nothing else', async () => {
    stubFetchRoutes({ [MEDIUM_URL]: async () => MEDIUM_TEXT });
    const manifest = buildManifest();
    queryClient.setQueryData(['manifest'], manifest);
    const hardCopy = { hash: 'c'.repeat(64), questions: ['local-1'].map(buildBoolQuestion) as Question[] };

    prefetchReviewBanks(queryClient, manifest, buildAccess(manifest, { 'python/hard': hardCopy }), [
      'kotlin/easy',
      'python/hard',
      'python/medium',
    ]);

    await waitFor(() => expect(countFetchesFor(MEDIUM_URL)).toBe(1));
    expect(countFetchesFor(HARD_URL)).toBe(0);
    expect(listFetchedUrls()).toEqual([MEDIUM_URL]);
  });

  it('waits REVIEW_BANK_RETRY_MS after a failed download before asking for the bank again', async () => {
    stubFetchRoutes({ [MEDIUM_URL]: async () => Promise.reject(new TypeError('Network request failed')) });
    const manifest = buildManifest();
    queryClient.setQueryData(['manifest'], manifest);
    const access = buildAccess(manifest, {});

    prefetchReviewBanks(queryClient, manifest, access, ['python/medium']);
    await waitFor(() =>
      expect(queryClient.getQueryState(['bank', 'python', 'medium', hashUtf8Hex(MEDIUM_TEXT)])?.status).toBe('error'),
    );
    const failedAt = queryClient.getQueryState(['bank', 'python', 'medium', hashUtf8Hex(MEDIUM_TEXT)])!.errorUpdatedAt;

    prefetchReviewBanks(queryClient, manifest, access, ['python/medium'], failedAt + REVIEW_BANK_RETRY_MS - 1);
    await settle();
    expect(countFetchesFor(MEDIUM_URL)).toBe(1);

    prefetchReviewBanks(queryClient, manifest, access, ['python/medium'], failedAt + REVIEW_BANK_RETRY_MS);
    await waitFor(() => expect(countFetchesFor(MEDIUM_URL)).toBe(2));
  });
});
