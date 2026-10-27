// The review route snapshots its round once, so it must wait for the content cache read as well as
// the stats: a round built before the cached Medium and Hard banks are read would leave out every due
// question from them, or say "Nothing due", and never update. While the cached manifest read is
// held, nothing of the round renders; once it resolves, the due question plays.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Question } from '@syntactical/content-schema';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';

import { createQueryClient } from '../../config/queryClient';
import { EVENT_LOG_STORAGE_KEY } from '../../constants/appConfig';
import { CONTENT_CACHE_KEYS } from '../../constants/contentCacheKeys';
import { BUNDLED_BANKS } from '../../services/content/bundledBanks.generated';
import type { LoggedAnswerEvent } from '../../services/stats/types/LoggedAnswerEvent';
import { ContentProvider } from '../../state/ContentProvider';
import { StatsProvider } from '../../state/StatsProvider';
import ReviewScreen from '../review';

jest.mock('../../components/auth/SignUpPrompt', () => ({ SignUpPrompt: () => null }));

const PYTHON_EASY = (BUNDLED_BANKS['python/easy'] as { questions: Question[] }).questions;
const DUE_QUESTION = PYTHON_EASY.find((question) => question.type === 'mc') as Extract<Question, { type: 'mc' }>;
const TEN_DAYS_MS = 10 * 86_400_000;

function seedMiss(questionId: string): LoggedAnswerEvent {
  return {
    answeredAt: new Date(Date.now() - TEN_DAYS_MS).toISOString(),
    bankKey: 'python/easy',
    choiceIndex: 0,
    eventId: `seed-${questionId}`,
    isCorrect: false,
    isHeld: false,
    isSynced: false,
    ownerUserId: null,
    questionId,
    roundKind: 'bank',
  };
}

// Holds the cached manifest read until the returned function is called; every other key reads as usual.
function holdManifestRead(): () => void {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  // The mock's getItem is already a jest.fn, so spyOn returns that same function: read through multiGet rather
  // than a captured getItem, which would call itself.
  jest.spyOn(AsyncStorage, 'getItem').mockImplementation(async (key: string) => {
    if (key === CONTENT_CACHE_KEYS.manifest) await gate;
    const [[, value]] = await AsyncStorage.multiGet([key]);
    return value;
  });
  return release;
}

describe('review route before the content cache is read', () => {
  beforeEach(() => AsyncStorage.clear());

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds no round until the content cache read finishes, then plays the due question', async () => {
    await AsyncStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify([seedMiss(DUE_QUESTION.id)]));
    const releaseManifest = holdManifestRead();

    await render(
      <QueryClientProvider client={createQueryClient()}>
        <ContentProvider contentBaseUrl={null}>
          <StatsProvider>
            <ReviewScreen />
          </StatsProvider>
        </ContentProvider>
      </QueryClientProvider>,
    );

    // Stats hydrate from their own keys while the manifest read is still held.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(DUE_QUESTION.prompt)).toBeNull();
    expect(screen.queryByText('Nothing due')).toBeNull();

    releaseManifest();
    await waitFor(() => expect(screen.queryByText(DUE_QUESTION.prompt)).not.toBeNull());
  });
});
