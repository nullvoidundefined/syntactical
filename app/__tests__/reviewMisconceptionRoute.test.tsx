import type { Question } from '@syntactical/content-schema';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import ReviewScreen from '../review';

const mockRecordAnswer = jest.fn();
jest.mock('../../state/StatsProvider', () => ({
  useQuizStats: () => ({ isHydrated: true, recordAnswer: mockRecordAnswer, recordCompletion: jest.fn() }),
}));
jest.mock('../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({ languages: [{ grammar: 'python', id: 'python', label: 'Python', misconceptions: [] }] }),
}));

function bool(id: string, misconceptionId?: string): Question {
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
  [bool('q-2', 'python.truthy'), bool('q-1', 'python.truthy'), bool('q-3')].map((question) => [question.id, { difficulty: 'easy', language: 'python', question }] as const),
);
jest.mock('../../state/useReviewQueue', () => ({
  useReviewQueue: () => ({ dueQuestions: [], nextDueAt: null, questionIndex: mockQuestionIndex }),
}));

describe('review route for one misconception', () => {
  it('plays that misconception\'s questions, whether or not they are due, and records review answers', async () => {
    await renderRouter({ review: ReviewScreen }, { initialUrl: '/review?misconception=python.truthy' });
    await waitFor(() => expect(screen.queryByText('Prompt q-1')).not.toBeNull());
    expect(screen.queryByText('Q1 / 2')).not.toBeNull();
    expect(screen.queryByText('Python / Easy / True / False')).not.toBeNull();
    await fireEvent.press(screen.getByText('True'));
    expect(mockRecordAnswer).toHaveBeenCalledWith(expect.objectContaining({ language: 'python', questionId: 'q-1', roundKind: 'review' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.queryByText('Prompt q-2')).not.toBeNull();
  });

  it('shows nothing due for a misconception with no local questions', async () => {
    await renderRouter({ review: ReviewScreen }, { initialUrl: '/review?misconception=python.unknown' });
    await waitFor(() => expect(screen.queryByText('Nothing due')).not.toBeNull());
  });
});
