import type { Question } from '@syntactical/content-schema';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { TEST_PROVENANCE } from '../../../services/content/__tests__/fixtures/contentFixtures';
import { QuizRound } from '../QuizRound';

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

function readShownOrder(): string[] {
  return ['right', 'wrong-1', 'wrong-2', 'wrong-3']
    .map((text) => ({ text, position: screen.getAllByText(text)[0] }))
    .sort((left, right) => readLabelRank(left.text) - readLabelRank(right.text))
    .map((entry) => entry.text);
}

// The choice buttons render in display order; read that order from the button names.
function readLabelRank(text: string): number {
  const names = screen
    .getAllByRole('button')
    .map((button) => String(button.props['aria-label'] ?? ''))
    .filter((name) => /^(right|wrong-\d)(,|$)/.test(name))
    .map((name) => name.split(',')[0]);
  return names.indexOf(text);
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
    await fireEvent.press(screen.getByLabelText('right'));
    expect(screen.queryByRole('button', { name: 'Explain' })).toBeNull();
    expect(screen.getByLabelText('right, correct')).toBeTruthy();
  });

  it('scores a displayed wrong choice as incorrect and explains it with its own rationale', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    await renderRound();
    await fireEvent.press(screen.getByLabelText('wrong-1'));
    expect(screen.getByLabelText('wrong-1, incorrect')).toBeTruthy();
    expect(screen.getByLabelText('right, correct')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Explain' }));
    expect(screen.queryByText('because one is wrong')).not.toBeNull();
  });

  it('does not reorder the choices when the round re-renders after an answer', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    await renderRound();
    const before = readShownOrder();
    expect(before).not.toEqual(['right', 'wrong-1', 'wrong-2', 'wrong-3']);
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    await fireEvent.press(screen.getByLabelText('wrong-2'));
    expect(readShownOrder()).toEqual(before);
  });
});
