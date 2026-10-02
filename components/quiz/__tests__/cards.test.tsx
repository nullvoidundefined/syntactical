import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Question } from '../../../services/content/types/Question';
import { BooleanCard } from '../BooleanCard';
import { MultipleChoiceCard } from '../MultipleChoiceCard';
import { ProgressBar } from '../ProgressBar';

const query = { explanation: 'e', title: 't' };
const HOSTILE = '<script>alert(1)</script><b>bold</b>';
const mcQuestion = { answerIndex: 1, choices: [HOSTILE, 'plain'], id: 'q-1', prompt: HOSTILE, query, type: 'mc' } as Extract<Question, { type: 'mc' }>;
const boolQuestion = { answer: false, id: 'q-2', prompt: 'p', query, type: 'bool' } as Extract<Question, { type: 'bool' }>;

describe('question cards', () => {
  it('renders markup in a prompt and a choice as literal text', async () => {
    await render(<MultipleChoiceCard question={mcQuestion} grammar="javascript" submittedAnswer={null} isAnswered={false} onSelect={jest.fn()} />);
    expect(screen.getAllByText(HOSTILE)).toHaveLength(2);
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
