import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Question } from '@syntactical/content-schema';
import { computeDailyProgress, findDueReviewEventIds } from '@syntactical/progress';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createQueryClient } from '../../config/queryClient';
import { EVENT_LOG_STORAGE_KEY } from '../../constants/appConfig';
import { BUNDLED_BANKS } from '../../services/content/bundledBanks.generated';
import type { LoggedAnswerEvent } from '../../services/stats/types/LoggedAnswerEvent';
import { ContentProvider } from '../../state/ContentProvider';
import { StatsProvider } from '../../state/StatsProvider';
import ReviewScreen from '../review';

const PYTHON_EASY = (BUNDLED_BANKS['python/easy'] as { questions: Question[] }).questions;
const DUE_IDS = ['py-easy-01', 'py-easy-02', 'py-easy-03'];
const TEN_DAYS_MS = 10 * 86_400_000;

function seedMiss(questionId: string, answeredAt: string, bankKey = 'python/easy'): LoggedAnswerEvent {
  return {
    answeredAt,
    bankKey,
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

function findQuestion(id: string): Extract<Question, { type: 'mc' }> {
  const question = PYTHON_EASY.find((candidate) => candidate.id === id);
  if (question?.type !== 'mc') throw new Error(`fixture question ${id} is not multiple choice`);
  return question;
}

async function readStoredLog(): Promise<LoggedAnswerEvent[]> {
  return JSON.parse((await AsyncStorage.getItem(EVENT_LOG_STORAGE_KEY)) ?? '[]');
}

async function renderReview(seed: LoggedAnswerEvent[]) {
  await AsyncStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify(seed));
  await render(
    <QueryClientProvider client={createQueryClient()}>
      <ContentProvider contentBaseUrl={null}>
        <StatsProvider>
          <ReviewScreen />
        </StatsProvider>
      </ContentProvider>
    </QueryClientProvider>,
  );
}

// The sign-up prompt reads auth and stats; SignUpPrompt.test.tsx covers it.
jest.mock('../../components/auth/SignUpPrompt', () => ({ SignUpPrompt: () => null }));

describe('review route', () => {
  beforeEach(() => AsyncStorage.clear());

  it('plays the due questions offline from bundled banks and counts correct due answers toward the daily goal with the bonus', async () => {
    const start = Date.now() - TEN_DAYS_MS;
    const seed = DUE_IDS.map((id, index) => seedMiss(id, new Date(start + index * 1000).toISOString()));
    await renderReview(seed);
    for (const id of DUE_IDS) {
      const { answerIndex, choices, prompt } = findQuestion(id);
      await waitFor(() => expect(screen.queryByText(prompt)).not.toBeNull());
      await fireEvent.press(screen.getAllByRole('button', { name: choices[answerIndex].text })[0]);
      await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    }
    expect(screen.queryByText('Review / Due / Complete')).not.toBeNull();
    expect(screen.queryByText('3 of 3 correct')).not.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
    await waitFor(async () => expect(await readStoredLog()).toHaveLength(6));
    const log = await readStoredLog();
    const reviews = log.slice(3);
    expect(reviews.map(({ questionId, roundKind }) => [questionId, roundKind])).toEqual(DUE_IDS.map((id) => [id, 'review']));
    const dueIds = findDueReviewEventIds(log);
    expect(reviews.every(({ eventId }) => dueIds.has(eventId))).toBe(true);
    const progress = computeDailyProgress(log, 'UTC', [{ from: '2000-01-01', goal: 10 }], ({ eventId }) => dueIds.has(eventId));
    expect(progress.reduce((total, { xp }) => total + xp, 0)).toBe(6);
  });

  it('skips a due question whose bank has no local copy', async () => {
    const start = new Date(Date.now() - TEN_DAYS_MS).toISOString();
    await renderReview([seedMiss('py-easy-01', start), seedMiss('elixir-easy-01', start, 'elixir/easy')]);
    await waitFor(() => expect(screen.queryByText(findQuestion('py-easy-01').prompt)).not.toBeNull());
    expect(screen.queryByText('Q1 / 1')).not.toBeNull();
  });

  it('shows nothing due with the next due time when no item is due yet', async () => {
    await renderReview([seedMiss('py-easy-01', new Date().toISOString())]);
    await waitFor(() => expect(screen.queryByText('Nothing due')).not.toBeNull());
    expect(screen.getByRole('heading', { name: 'Review' })).toBeTruthy();
    expect(screen.queryByText(/^Next review due /)).not.toBeNull();
  });

  it('explains how reviews start when nothing has been answered', async () => {
    await renderReview([]);
    await waitFor(() => expect(screen.queryByText('Nothing due')).not.toBeNull());
    expect(screen.queryByText(/missed ones come back here/)).not.toBeNull();
  });
});
