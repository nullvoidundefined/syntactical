import type { Question } from '@syntactical/content-schema';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { QuizRound } from '../QuizRound';

jest.mock('../../../state/StatsProvider', () => ({
  useQuizStats: () => ({ eventLog: [], isHydrated: true, recordAnswer: jest.fn(), recordCompletion: jest.fn() }),
}));
jest.mock('../../auth/SignUpPrompt', () => ({ SignUpPrompt: () => null }));

const SOURCE = {
  quote: 'Lax cookies are withheld on cross-site POST',
  title: 'Using HTTP cookies',
  url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies',
};

function buildQuestion(validation: Record<string, unknown>): Question {
  return {
    answer: true,
    id: 'q-1',
    prompt: 'Is it?',
    provenance: { isHumanReviewed: false, source: 'generated', validation },
    query: { explanation: 'e', title: 't' },
    type: 'bool',
  } as unknown as Question;
}

async function openDrawer(question: Question) {
  await render(
    <QuizRound
      language="backend-security"
      languageLabel="Backend Security"
      difficulty="easy"
      difficultyLabel="Easy"
      grammar="plain"
      questions={[question]}
      onExit={jest.fn()}
      onRetry={jest.fn()}
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Query' }));
}

describe('QuizRound evidence source', () => {
  it('shows the source line for a judged card', async () => {
    await openDrawer(
      buildQuestion({ evidence: { sources: [SOURCE], verdict: 'ok' }, method: 'judged', status: 'passed' }),
    );
    expect(screen.queryByText('Source: Using HTTP cookies')).not.toBeNull();
  });

  it('shows no source line for an executed card', async () => {
    await openDrawer(buildQuestion({ method: 'executed', status: 'passed' }));
    expect(screen.queryByText(/^Source:/)).toBeNull();
  });

  it('shows no source line for a judged card whose source title is blank', async () => {
    await openDrawer(
      buildQuestion({
        evidence: { sources: [{ ...SOURCE, title: '   ' }], verdict: 'ok' },
        method: 'judged',
        status: 'passed',
      }),
    );
    expect(screen.queryByText(/^Source:/)).toBeNull();
  });
});
