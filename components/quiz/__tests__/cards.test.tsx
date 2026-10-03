import type { Question } from '@syntactical/content-schema';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { BooleanCard } from '../BooleanCard';
import { MultipleChoiceCard } from '../MultipleChoiceCard';
import { ProgressBar } from '../ProgressBar';
import { TEST_PROVENANCE } from '../../../services/content/__tests__/fixtures/contentFixtures';

const query = { explanation: 'e', title: 't' };
const HOSTILE = '<script>alert(1)</script><b>bold</b>';
const mcQuestion = { answerIndex: 1, choices: [{ text: HOSTILE }, { text: 'plain' }], id: 'q-1', prompt: HOSTILE, query, provenance: TEST_PROVENANCE, type: 'mc' } as Extract<Question, { type: 'mc' }>;
const boolQuestion = { answer: false, id: 'q-2', prompt: 'p', query, provenance: TEST_PROVENANCE, type: 'bool' } as Extract<Question, { type: 'bool' }>;

describe('question cards', () => {
  it('renders markup in a prompt and a choice as literal text', async () => {
    await render(<MultipleChoiceCard question={mcQuestion} grammar="javascript" submittedAnswer={null} isAnswered={false} onSelect={jest.fn()} />);
    expect(screen.getAllByText(HOSTILE)).toHaveLength(2);
  });

  it('renders the text of v2 object choices and keeps the text-only accessible names', async () => {
    const richQuestion = {
      ...mcQuestion,
      choices: [{ code: 'x = 1', misconceptionId: 'm-1', rationale: 'because', text: 'first' }, { text: 'second' }],
    } as Extract<Question, { type: 'mc' }>;
    await render(<MultipleChoiceCard question={richQuestion} grammar="python" submittedAnswer={0} isAnswered onSelect={jest.fn()} />);
    expect(screen.getByText('first')).toBeTruthy();
    expect(screen.getByLabelText('first, incorrect')).toBeTruthy();
    expect(screen.getByLabelText('second, correct')).toBeTruthy();
  });

  it('marks the chosen wrong answer and the correct answer once answered', async () => {
    await render(<MultipleChoiceCard question={mcQuestion} grammar="javascript" submittedAnswer={0} isAnswered onSelect={jest.fn()} />);
    expect(screen.getByLabelText(`${HOSTILE}, incorrect`)).toBeTruthy();
    expect(screen.getByLabelText('plain, correct')).toBeTruthy();
  });

  it('reports a boolean selection and disables both options after answering', async () => {
    const onSelect = jest.fn();
    const { rerender } = await render(<BooleanCard question={boolQuestion} grammar="python" submittedAnswer={null} isAnswered={false} onSelect={onSelect} />);
    await fireEvent.press(screen.getByText('False'));
    expect(onSelect).toHaveBeenCalledWith(false);
    await rerender(<BooleanCard question={boolQuestion} grammar="python" submittedAnswer={false} isAnswered onSelect={onSelect} />);
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });

  it('shows the position out of the total', async () => {
    await render(<ProgressBar current={2} total={10} />);
    expect(screen.getByText('Q3 / 10')).toBeTruthy();
    expect(screen.getByRole('progressbar')).toHaveProp('aria-valuenow', 2);
  });
});
