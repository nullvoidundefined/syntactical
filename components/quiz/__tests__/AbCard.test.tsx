import type { Question } from '@syntactical/content-schema';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { useState } from 'react';

import { AbCard } from '../AbCard';
import { TEST_PROVENANCE } from '../../../services/content/__tests__/fixtures/contentFixtures';

type AbQuestion = Extract<Question, { type: 'ab' }>;

const query = { explanation: 'e', title: 't' };

function buildAbQuestion(criterion: AbQuestion['criterion']): AbQuestion {
  return {
    answerIndex: 1,
    choices: [
      { code: 'return items.length;', text: 'scan' },
      { code: 'return sizeOf(items);', text: 'lookup' },
    ],
    criterion,
    id: 'q-ab',
    prompt: 'Which is optimal?',
    provenance: TEST_PROVENANCE,
    query,
    type: 'ab',
  };
}

const PERFORMANCE = { evidence: 'A: 9.8 ms, B: 1.2 ms median on Node 22.11.0', statement: 'Lower median runtime wins', type: 'performance' } as const;

describe('AbCard', () => {
  it('shows the criterion statement before any answer, and no evidence', async () => {
    await render(<AbCard question={buildAbQuestion(PERFORMANCE)} grammar="javascript" submittedAnswer={null} isAnswered={false} onSelect={jest.fn()} />);
    expect(screen.getByText('Lower median runtime wins')).toBeTruthy();
    expect(screen.queryByText(PERFORMANCE.evidence)).toBeNull();
  });

  it('renders each option as a labeled group holding its own code block', async () => {
    await render(<AbCard question={buildAbQuestion(PERFORMANCE)} grammar="javascript" submittedAnswer={null} isAnswered={false} onSelect={jest.fn()} />);
    const optionA = screen.getByLabelText('Option A');
    const optionB = screen.getByLabelText('Option B');
    expect(within(optionA).getByText('return items.length;')).toBeTruthy();
    expect(within(optionA).queryByText('return sizeOf(items);')).toBeNull();
    expect(within(optionB).getByText('return sizeOf(items);')).toBeTruthy();
    expect(screen.getAllByTestId('code-block')).toHaveLength(2);
  });

  it('answers with the option that was pressed, which then shows as incorrect beside the right one', async () => {
    function Harness() {
      const [answer, setAnswer] = useState<number | null>(null);
      return <AbCard question={buildAbQuestion(PERFORMANCE)} grammar="javascript" submittedAnswer={answer} isAnswered={answer !== null} onSelect={setAnswer} />;
    }
    await render(<Harness />);
    await fireEvent.press(screen.getByRole('button', { name: 'Choose Option A' }));
    expect(screen.getByRole('button', { name: 'Option A, incorrect' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Option B, correct' })).toBeDisabled();
  });

  it('marks the right and the chosen wrong option, and disables both once answered', async () => {
    await render(<AbCard question={buildAbQuestion(PERFORMANCE)} grammar="javascript" submittedAnswer={0} isAnswered onSelect={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Option A, incorrect' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Option B, correct' })).toBeDisabled();
  });

  it('labels the option that was neither chosen nor correct as not chosen, never as something to choose', async () => {
    await render(<AbCard question={buildAbQuestion(PERFORMANCE)} grammar="javascript" submittedAnswer={1} isAnswered onSelect={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Option A, not chosen' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Choose/ })).toBeNull();
  });

  it.each([
    [PERFORMANCE, 'Benchmark result'],
    [{ evidence: 'Fails for input []: IndexError', statement: 'Handles every input', type: 'correctness' }, 'Failing edge case'],
    [{ evidence: 'Names say what they hold', statement: 'Easier to read', type: 'readability' }, 'Rubric reason (judged, not run)'],
  ] as const)('shows the evidence under a title that matches the %# criterion type once answered', async (criterion, title) => {
    await render(<AbCard question={buildAbQuestion(criterion)} grammar="javascript" submittedAnswer={1} isAnswered onSelect={jest.fn()} />);
    expect(screen.getByText(criterion.evidence)).toBeTruthy();
    expect(screen.getByRole('heading', { name: title })).toBeTruthy();
  });
});
