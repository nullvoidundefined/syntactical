import type { Question } from '@syntactical/content-schema';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { TEST_PROVENANCE } from '../../../services/content/__tests__/fixtures/contentFixtures';
import { QuizRound } from '../QuizRound';

import { choiceName } from './choiceName';

jest.mock('../../../state/StatsProvider', () => ({
  useQuizStats: () => ({ eventLog: [], isHydrated: true, recordAnswer: jest.fn(), recordCompletion: jest.fn() }),
}));
jest.mock('../../auth/SignUpPrompt', () => ({ SignUpPrompt: () => null }));

const query = { explanation: 'Because', title: 'Why' };
const questions = [
  {
    answerIndex: 0,
    choices: [
      { rationale: 'why right', text: 'right' },
      { rationale: 'because one is wrong', text: 'wrong-1' },
      { rationale: 'why two', text: 'wrong-2' },
      { rationale: 'why three', text: 'wrong-3' },
    ],
    id: 'q-mc',
    prompt: 'Pick one',
    query,
    provenance: TEST_PROVENANCE,
    type: 'mc',
  },
] as Question[];

async function renderRound() {
  const props = {
    difficulty: 'easy',
    difficultyLabel: 'Easy',
    grammar: 'python',
    language: 'python',
    languageLabel: 'Python',
  } as const;
  return render(<QuizRound {...props} questions={questions} onExit={jest.fn()} onRetry={jest.fn()} />);
}

// The choice buttons render in display order; read that order from their accessible names
// (the key letter, the choice text, then ", correct" or ", incorrect" once answered).
function readShownOrder(): string[] {
  return screen
    .getAllByRole('button', { name: /^[A-D]\s*(right|wrong-\d)/ })
    .map((button) => String(within(button).getByText(/^(right|wrong-\d)$/).props.children));
}

afterEach(() => jest.restoreAllMocks());

describe('QuizRound choice order', () => {
  it('shows the mc choices shuffled, not in bank order', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    await renderRound();
    expect(readShownOrder()).not.toEqual(['right', 'wrong-1', 'wrong-2', 'wrong-3']);
  });

  it('scores the displayed correct choice as correct, with no Explain offered', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    await renderRound();
    await fireEvent.press(screen.getByRole('button', { name: choiceName('[A-D]', 'right') }));
    expect(screen.queryByRole('button', { name: 'Explain' })).toBeNull();
    expect(screen.getByRole('button', { name: choiceName('[A-D]', 'right', 'correct') })).toBeTruthy();
  });

  it('scores a displayed wrong choice as incorrect and explains it with its own rationale', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    await renderRound();
    await fireEvent.press(screen.getByRole('button', { name: choiceName('[A-D]', 'wrong-1') }));
    expect(screen.getByRole('button', { name: choiceName('[A-D]', 'wrong-1', 'incorrect') })).toBeTruthy();
    expect(screen.getByRole('button', { name: choiceName('[A-D]', 'right', 'correct') })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Explain' }));
    expect(screen.queryByText('because one is wrong')).not.toBeNull();
  });

  it('does not reorder the choices when the round re-renders after an answer', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    await renderRound();
    const before = readShownOrder();
    expect(before).not.toEqual(['right', 'wrong-1', 'wrong-2', 'wrong-3']);
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    await fireEvent.press(screen.getByRole('button', { name: choiceName('[A-D]', 'wrong-2') }));
    expect(readShownOrder()).toEqual(before);
  });
});
