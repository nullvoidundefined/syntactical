// Choices are shuffled per round, but a recorded answer must name the choice by its bank index:
// the server re-scores synced answers against the bank's answerIndex, and the weakness report and
// review queue read the bank's choices[choiceIndex]. A displayed index would corrupt all three.
import type { Question } from '@syntactical/content-schema';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { TEST_PROVENANCE } from '../../../services/content/__tests__/fixtures/contentFixtures';
import { QuizRound } from '../QuizRound';

const mockRecordAnswer = jest.fn();

jest.mock('../../../state/StatsProvider', () => ({
  useQuizStats: () => ({ eventLog: [], isHydrated: true, recordAnswer: mockRecordAnswer, recordCompletion: jest.fn() }),
}));
jest.mock('../../auth/SignUpPrompt', () => ({ SignUpPrompt: () => null }));

const questions = [
  {
    answerIndex: 0,
    choices: [
      { rationale: 'why right', text: 'right' },
      { rationale: 'why one', text: 'wrong-1' },
      { rationale: 'why two', text: 'wrong-2' },
      { rationale: 'why three', text: 'wrong-3' },
    ],
    id: 'q-mc',
    prompt: 'Pick one',
    query: { explanation: 'Because', title: 'Why' },
    provenance: TEST_PROVENANCE,
    type: 'mc',
  },
] as Question[];

async function renderRound() {
  return render(
    <QuizRound
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
}

afterEach(() => {
  jest.restoreAllMocks();
  mockRecordAnswer.mockClear();
});

describe('QuizRound recorded answer under shuffled choices', () => {
  // With Math.random at 0, Fisher-Yates shows [wrong-1, wrong-2, wrong-3, right]: no choice sits at
  // its bank index, so a displayed index can never pass for the bank one.
  it.each([
    ['right', 0, true],
    ['wrong-1', 1, false],
    ['wrong-3', 3, false],
  ])('records %s by its bank index %i', async (text, bankIndex, wasCorrect) => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    await renderRound();
    await fireEvent.press(screen.getByLabelText(text));
    expect(mockRecordAnswer).toHaveBeenCalledTimes(1);
    expect(mockRecordAnswer.mock.calls[0]?.[0]).toMatchObject({
      choiceIndex: bankIndex,
      questionId: 'q-mc',
      wasCorrect,
    });
  });
});
