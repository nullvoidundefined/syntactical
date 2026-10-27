// A round the screen lets ask passes the drawer the question's bank, id, and the learner's choice
// by its bank index, even under shuffled choices; a round that may not ask shows no ask box.
import type { Question } from '@syntactical/content-schema';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { requestAskAnswer } from '../../../services/ask/requestAskAnswer';
import { TEST_PROVENANCE } from '../../../services/content/__tests__/fixtures/contentFixtures';
import { QuizRound } from '../QuizRound';

import { choiceName } from './choiceName';

jest.mock('../../../state/StatsProvider', () => ({
  useQuizStats: () => ({ eventLog: [], isHydrated: true, recordAnswer: jest.fn(), recordCompletion: jest.fn() }),
}));
jest.mock('../../auth/SignUpPrompt', () => ({ SignUpPrompt: () => null }));
jest.mock('../../../services/ask/requestAskAnswer', () => ({ requestAskAnswer: jest.fn() }));

const mockRequest = jest.mocked(requestAskAnswer);

const questions = [
  {
    answerIndex: 0,
    choices: [{ text: 'right' }, { text: 'wrong-1' }, { text: 'wrong-2' }, { text: 'wrong-3' }],
    id: 'q-mc',
    prompt: 'Pick one',
    provenance: TEST_PROVENANCE,
    query: { explanation: 'Because', title: 'Why' },
    type: 'mc',
  },
] as Question[];

async function answerAndOpenQuery(canAsk: boolean) {
  await render(
    <QuizRound
      canAsk={canAsk}
      difficulty="easy"
      difficultyLabel="Easy"
      grammar="python"
      language="python"
      languageLabel="Python"
      questions={questions}
      onExit={jest.fn()}
      onRetry={jest.fn()}
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: choiceName('[A-D]', 'wrong-3') }));
  await fireEvent.press(screen.getByRole('button', { name: /^explain/i }));
}

afterEach(() => {
  jest.restoreAllMocks();
  mockRequest.mockReset();
});

describe('QuizRound ask', () => {
  it('asks about the question by its bank and the choice by its bank index', async () => {
    // With Math.random at 0 the card shows [wrong-1, wrong-2, wrong-3, right].
    jest.spyOn(Math, 'random').mockReturnValue(0);
    mockRequest.mockResolvedValueOnce({ answer: 'ok', limit: 20, remaining: 1, status: 'answered' });
    await answerAndOpenQuery(true);

    await fireEvent.changeText(screen.getByLabelText('Your question about this card'), 'Why not this one?');
    await fireEvent.press(screen.getByRole('button', { name: 'Ask' }));

    expect(mockRequest).toHaveBeenCalledWith(
      { bankKey: 'python/easy', choiceIndex: 3, questionId: 'q-mc' },
      'Why not this one?',
    );
  });

  it('shows no ask box when the learner may not ask', async () => {
    await answerAndOpenQuery(false);

    expect(screen.queryByRole('heading', { name: 'Ask about this card' })).toBeNull();
  });
});
