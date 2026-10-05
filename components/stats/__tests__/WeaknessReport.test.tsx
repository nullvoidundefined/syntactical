import type { Question } from '@syntactical/content-schema';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { LoggedAnswerEvent } from '../../../services/stats/types/LoggedAnswerEvent';
import { WeaknessReport } from '../WeaknessReport';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

let mockEventLog: LoggedAnswerEvent[] = [];
jest.mock('../../../state/StatsProvider', () => ({ useQuizStats: () => ({ eventLog: mockEventLog }) }));

const question: Question = {
  answerIndex: 0,
  choices: [{ text: 'right' }, { misconceptionId: 'python.mutable-default-args', text: 'wrong' }],
  id: 'py-easy-01',
  prompt: 'p',
  provenance: { isHumanReviewed: false, source: 'original', validation: { method: 'judged', status: 'pending' } },
  query: { explanation: 'e', title: 't' },
  type: 'mc',
};
const mockQuestionIndex = new Map([['py-easy-01', { difficulty: 'easy', language: 'python', question }]]);
jest.mock('../../../state/useReviewQueue', () => ({ useReviewQueue: () => ({ questionIndex: mockQuestionIndex }) }));
jest.mock('../../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({
    languages: [
      { misconceptions: [{ description: 'Mutable default arguments are shared', id: 'python.mutable-default-args' }] },
    ],
  }),
}));

function buildLog(count: number, choiceIndex: number): LoggedAnswerEvent[] {
  return Array.from({ length: count }, (_unused, index) => ({
    answeredAt: new Date(Date.now() - 60_000).toISOString(),
    bankKey: 'python/easy',
    choiceIndex,
    eventId: `event-${index}`,
    isCorrect: choiceIndex === 0,
    isHeld: false,
    isSynced: true,
    ownerUserId: 'user-1',
    questionId: 'py-easy-01',
    roundKind: 'bank',
  }));
}

describe('WeaknessReport', () => {
  it('asks the learner to keep playing, with the remaining count, below 20 answers this week', async () => {
    mockEventLog = buildLog(12, 1);
    await render(<WeaknessReport />);
    expect(screen.queryByText('Weak spots this week')).not.toBeNull();
    expect(screen.queryByText('Keep playing to see your weak spots')).not.toBeNull();
    expect(screen.queryByText('8 more answers this week')).not.toBeNull();
  });

  it('lists a missed misconception with its description and starts its review round on tap', async () => {
    mockEventLog = buildLog(20, 1);
    await render(<WeaknessReport />);
    const link = screen.getByRole('link', { name: 'Review Mutable default arguments are shared, missed 20 of 20' });
    expect(screen.queryByText('Mutable default arguments are shared')).not.toBeNull();
    await fireEvent.press(link);
    expect(mockPush).toHaveBeenCalledWith({
      params: { misconception: 'python.mutable-default-args' },
      pathname: '/review',
    });
  });

  it('says so when nothing was missed this week', async () => {
    mockEventLog = buildLog(20, 0);
    await render(<WeaknessReport />);
    expect(screen.queryByText('No repeated misses this week')).not.toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
