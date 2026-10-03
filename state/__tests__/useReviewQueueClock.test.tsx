import type { CachedBank, Question } from '@syntactical/content-schema';
import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import type { LoggedAnswerEvent } from '../../services/stats/types/LoggedAnswerEvent';
import { useReviewQueue } from '../useReviewQueue';

const START = Date.parse('2026-10-03T12:00:00Z');
const question: Question = {
  answerIndex: 0,
  choices: [{ text: 'right' }, { text: 'wrong' }],
  id: 'py-easy-01',
  prompt: 'p',
  provenance: { isHumanReviewed: false, source: 'original', validation: { method: 'judged', status: 'pending' } },
  query: { explanation: 'e', title: 't' },
  type: 'mc',
};
const bank: CachedBank = { hash: 'a'.repeat(64), questions: [question] };
const mockReadLocalBank = () => bank;
// A miss just now: the scheduler brings the question back within minutes.
const mockEventLog: LoggedAnswerEvent[] = [
  {
    answeredAt: new Date(START).toISOString(),
    bankKey: 'python/easy',
    choiceIndex: 1,
    eventId: 'event-1',
    isCorrect: false,
    isHeld: false,
    isSynced: false,
    ownerUserId: null,
    questionId: 'py-easy-01',
    roundKind: 'bank',
  },
];

jest.mock('../StatsProvider', () => ({ useQuizStats: () => ({ eventLog: mockEventLog }) }));
jest.mock('../ContentProvider', () => ({ useContentContext: () => ({ readLocalBank: mockReadLocalBank }) }));

describe('useReviewQueue as time passes', () => {
  beforeEach(() => jest.useFakeTimers({ now: START }));
  afterEach(() => jest.useRealTimers());

  it('lists an item once it comes due, with no new answer', async () => {
    const { result } = await renderHook(() => useReviewQueue());
    expect(result.current.dueQuestions).toHaveLength(0);
    expect(Date.parse(result.current.nextDueAt ?? '')).toBeLessThanOrEqual(START + 2 * 60_000);
    await act(async () => {
      jest.advanceTimersByTime(3 * 60_000);
    });
    expect(result.current.dueQuestions.map(({ question: { id } }) => id)).toEqual(['py-easy-01']);
  });

  it('refreshes when the app returns to the foreground', async () => {
    const listeners: ((state: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: string) => void);
      return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
    });
    const { result } = await renderHook(() => useReviewQueue());
    jest.setSystemTime(START + 10 * 60_000);
    await act(async () => {
      listeners.forEach((listener) => listener('active'));
    });
    expect(result.current.dueQuestions).toHaveLength(1);
  });
});
