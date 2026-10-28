// The review route with `misconceptions` (the study note's "Practice these"): one round over the
// listed misconceptions' local questions, taken in turn, at most 10, labelled as weak spots. The
// single `misconception` parameter keeps playing one misconception's questions.
import type { Question } from '@syntactical/content-schema';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import ReviewScreen from '../review';

jest.mock('../../state/useCanAsk', () => ({ useCanAsk: () => false }));
jest.mock('../../state/ContentProvider', () => ({
  ...jest.requireActual('../../state/ContentProvider'),
  useContentContext: () => ({ isHydrated: true }),
}));
jest.mock('../../state/StatsProvider', () => ({
  useQuizStats: () => ({ eventLog: [], isHydrated: true, recordAnswer: jest.fn(), recordCompletion: jest.fn() }),
}));
jest.mock('../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({
    languages: [{ grammar: 'python', id: 'python', label: 'Python', misconceptions: [] }],
  }),
}));
// The sign-up prompt reads auth and stats; SignUpPrompt.test.tsx covers it.
jest.mock('../../components/auth/SignUpPrompt', () => ({ SignUpPrompt: () => null }));

function bool(id: string, misconceptionId: string): Question {
  return {
    answer: true,
    id,
    misconceptionId,
    prompt: `Prompt ${id}`,
    provenance: { isHumanReviewed: false, source: 'original', validation: { method: 'judged', status: 'pending' } },
    query: { explanation: 'e', title: 't' },
    type: 'bool',
  };
}

const mockQuestionIndex = new Map(
  [
    bool('t-2', 'python.truthy'),
    bool('t-1', 'python.truthy'),
    bool('n-1', 'python.none'),
    ...Array.from({ length: 12 }, (_unused, index) => bool(`m-${String(index).padStart(2, '0')}`, 'python.many')),
  ].map((question) => [question.id, { difficulty: 'easy', language: 'python', question }] as const),
);
jest.mock('../../state/useReviewQueue', () => ({
  useReviewQueue: () => ({ dueQuestions: [], nextDueAt: null, questionIndex: mockQuestionIndex }),
}));

async function playThrough(prompts: string[]): Promise<void> {
  for (const prompt of prompts) {
    await waitFor(() => expect(screen.queryByText(prompt)).not.toBeNull());
    await fireEvent.press(screen.getByText('True'));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  }
}

describe('review route for several misconceptions', () => {
  it("plays the misconceptions' questions in turn and labels the round as weak spots", async () => {
    await renderRouter({ review: ReviewScreen }, { initialUrl: '/review?misconceptions=python.truthy,python.none' });
    await waitFor(() => expect(screen.queryByText('Q1 / 3')).not.toBeNull());

    await playThrough(['Prompt t-1', 'Prompt n-1', 'Prompt t-2']);

    expect(screen.queryByText('Review / Weak spots / Complete')).not.toBeNull();
  });

  it('plays at most 10 questions', async () => {
    await renderRouter({ review: ReviewScreen }, { initialUrl: '/review?misconceptions=python.many,python.truthy' });

    await waitFor(() => expect(screen.queryByText('Q1 / 10')).not.toBeNull());
    expect(screen.queryByText('Prompt m-00')).not.toBeNull();
  });

  it('skips a misconception with no local questions', async () => {
    await renderRouter({ review: ReviewScreen }, { initialUrl: '/review?misconceptions=python.unknown,python.none' });

    await waitFor(() => expect(screen.queryByText('Q1 / 1')).not.toBeNull());
    await playThrough(['Prompt n-1']);
    expect(screen.queryByText('Review / Weak spot / Complete')).not.toBeNull();
  });

  it('shows nothing due when none of the misconceptions has local questions', async () => {
    await renderRouter({ review: ReviewScreen }, { initialUrl: '/review?misconceptions=python.unknown,python.gone' });

    await waitFor(() => expect(screen.queryByText('Nothing due')).not.toBeNull());
  });

  it("reads at most the study note's 3 misconceptions from the link", async () => {
    await renderRouter(
      { review: ReviewScreen },
      { initialUrl: '/review?misconceptions=python.unknown,python.gone,python.lost,python.none' },
    );

    await waitFor(() => expect(screen.queryByText('Nothing due')).not.toBeNull());
  });

  it('counts a repeated misconception once toward the 3', async () => {
    await renderRouter(
      { review: ReviewScreen },
      { initialUrl: '/review?misconceptions=python.unknown,python.unknown,python.unknown,python.none' },
    );

    await waitFor(() => expect(screen.queryByText('Q1 / 1')).not.toBeNull());
  });

  it('keeps playing every question of a single misconception, uncapped, as a weak spot', async () => {
    await renderRouter({ review: ReviewScreen }, { initialUrl: '/review?misconception=python.many' });

    await waitFor(() => expect(screen.queryByText('Q1 / 12')).not.toBeNull());
  });
});
