// components/quiz/__tests__/quizRoundSponsor.test.tsx
// QuizRound reads the sponsored card cadence when the round starts and tells its results screen what kind
// of round ended, so a due card shows after a bank round from the results screen's first render and never
// after a review round (app/review.tsx plays its rounds with roundKind="review").
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Question } from '@syntactical/content-schema';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { settle } from '../../../config/settle';
import { SPONSOR_CADENCE_STORAGE_KEY } from '../../../constants/appConfig';
import { TEST_PROVENANCE } from '../../../services/content/__tests__/fixtures/contentFixtures';
import { QuizRound } from '../QuizRound';

jest.mock('../../../state/StatsProvider', () => ({
  useQuizStats: () => ({ eventLog: [], isHydrated: true, recordAnswer: jest.fn(), recordCompletion: jest.fn() }),
}));
jest.mock('../../auth/SignUpPrompt', () => ({ SignUpPrompt: () => null }));
jest.mock('../../sponsor/SponsoredCard', () => {
  const { Text } = require('react-native');
  return {
    SponsoredCard: ({ placement }: { placement: string }) => <Text>{`sponsored ${placement}`}</Text>,
  };
});

const questions: Question[] = [
  {
    answer: true,
    id: 'q-1',
    prompt: 'Is it?',
    provenance: TEST_PROVENANCE,
    query: { explanation: 'e', title: 't' },
    type: 'bool',
  },
];

async function storeCadence(completedRounds: number, roundsSinceLastCard: number) {
  await AsyncStorage.setItem(SPONSOR_CADENCE_STORAGE_KEY, JSON.stringify({ completedRounds, roundsSinceLastCard }));
}

async function startRound(roundKind: 'bank' | 'review') {
  await render(
    <QuizRound
      language="python"
      languageLabel="Python"
      difficulty="easy"
      difficultyLabel="Easy"
      grammar="python"
      questions={questions}
      onExit={jest.fn()}
      onRetry={jest.fn()}
      roundKind={roundKind}
    />,
  );
  await settle();
}

async function finishRound() {
  await fireEvent.press(screen.getByText('True'));
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
}

beforeEach(() => AsyncStorage.clear());

describe('QuizRound and the results card', () => {
  it('shows a due card on the results screen of a bank round', async () => {
    await storeCadence(2, 2);
    await startRound('bank');
    await finishRound();
    expect(screen.getByText('sponsored results')).toBeTruthy();
  });

  it('decides from the cadence read when the round started', async () => {
    await storeCadence(2, 2);
    await startRound('bank');
    await storeCadence(0, 0);
    await finishRound();
    expect(screen.getByText('sponsored results')).toBeTruthy();
  });

  it('shows no card after a review round, even when one is due', async () => {
    await storeCadence(2, 2);
    await startRound('review');
    await finishRound();
    await settle();
    expect(screen.queryByText('1 of 1 correct')).not.toBeNull();
    expect(screen.queryByText('sponsored results')).toBeNull();
  });
});
