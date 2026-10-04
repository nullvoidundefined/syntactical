// A card's own grammar beats its entry's grammar for the question code, the choice code,
// and the query drawer, in a bank round and in a review round.
import type { Question } from '@syntactical/content-schema';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { TEST_PROVENANCE } from '../../../services/content/__tests__/fixtures/contentFixtures';
import { QuizRound } from '../QuizRound';

jest.mock('../../../state/StatsProvider', () => ({
  useQuizStats: () => ({ eventLog: [], isHydrated: true, recordAnswer: jest.fn(), recordCompletion: jest.fn() }),
}));
jest.mock('../../auth/SignUpPrompt', () => ({ SignUpPrompt: () => null }));

const EXACT_RUN = { normalizer: (text: string) => text };
const query = { explanation: 'Because', title: 'Why' };

function renderRound(
  question: Question,
  describeSource?: () => {
    difficulty: string;
    difficultyLabel: string;
    grammar: 'python';
    language: string;
    languageLabel: string;
  },
) {
  return render(
    <QuizRound
      language="backend-security"
      languageLabel="Backend Security"
      difficulty="easy"
      difficultyLabel="Easy"
      grammar="python"
      questions={[question]}
      onExit={jest.fn()}
      onRetry={jest.fn()}
      {...(describeSource ? { describeQuestion: describeSource } : {})}
    />,
  );
}

describe('per-question grammar', () => {
  it('highlights mc code with the question grammar', async () => {
    await renderRound({
      answerIndex: 0,
      choices: [{ text: 'a' }, { text: 'b' }],
      code: 'SELECT 1',
      grammar: 'sql',
      id: 'q-1',
      prompt: 'p',
      provenance: TEST_PROVENANCE,
      query,
      type: 'mc',
    });
    await waitFor(() => expect(screen.queryByText('SELECT', EXACT_RUN)).not.toBeNull());
  });

  it('uses the entry grammar when the question has none', async () => {
    await renderRound({
      answerIndex: 0,
      choices: [{ text: 'a' }, { text: 'b' }],
      code: 'SELECT 1',
      id: 'q-1',
      prompt: 'p',
      provenance: TEST_PROVENANCE,
      query,
      type: 'mc',
    });
    await waitFor(() => expect(screen.queryByTestId('code-block')).not.toBeNull());
    expect(screen.queryByText('SELECT', EXACT_RUN)).toBeNull();
  });

  it('highlights bool code with the question grammar', async () => {
    await renderRound({
      answer: true,
      code: 'SELECT 1',
      grammar: 'sql',
      id: 'q-1',
      prompt: 'p',
      provenance: TEST_PROVENANCE,
      query,
      type: 'bool',
    });
    await waitFor(() => expect(screen.queryByText('SELECT', EXACT_RUN)).not.toBeNull());
  });

  it('highlights ab choice code with the question grammar when the question has no code', async () => {
    await renderRound({
      answerIndex: 1,
      choices: [
        { code: "SELECT * FROM users WHERE id = '' || $1", text: 'Concatenated' },
        { code: 'SELECT * FROM users WHERE id = $1', text: 'Bound' },
      ],
      criterion: {
        evidence: 'A bound parameter is never parsed as SQL.',
        statement: 'Which query is safe from injection?',
        type: 'correctness',
      },
      grammar: 'sql',
      id: 'q-1',
      prompt: 'Pick the fix',
      provenance: TEST_PROVENANCE,
      query,
      type: 'ab',
    });
    await waitFor(() => expect(screen.getAllByText('SELECT', EXACT_RUN)).toHaveLength(2));
  });

  it('highlights the query drawer syntax with the question grammar', async () => {
    await renderRound({
      answer: true,
      grammar: 'sql',
      id: 'q-1',
      prompt: 'p',
      provenance: TEST_PROVENANCE,
      query: { ...query, syntax: 'SELECT 1' },
      type: 'bool',
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Query' }));
    await waitFor(() => expect(screen.queryByText('SELECT', EXACT_RUN)).not.toBeNull());
  });

  it('beats the review round source grammar', async () => {
    const describeSource = () => ({
      difficulty: 'easy',
      difficultyLabel: 'Easy',
      grammar: 'python' as const,
      language: 'backend-security',
      languageLabel: 'Backend Security',
    });
    await renderRound(
      {
        answer: true,
        code: 'SELECT 1',
        grammar: 'sql',
        id: 'q-1',
        prompt: 'p',
        provenance: TEST_PROVENANCE,
        query,
        type: 'bool',
      },
      describeSource,
    );
    await waitFor(() => expect(screen.queryByText('SELECT', EXACT_RUN)).not.toBeNull());
  });
});
