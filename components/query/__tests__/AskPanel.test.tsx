// "Ask about this card": sends the trimmed question for this card, shows the answer and the answers
// left today, says why when there is no answer, and drops a reply that lands after it is gone.
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { requestAskAnswer } from '../../../services/ask/requestAskAnswer';
import type { AskResult } from '../../../services/ask/types/AskResult';
import { AskPanel } from '../AskPanel';

jest.mock('../../../services/ask/requestAskAnswer', () => ({ requestAskAnswer: jest.fn() }));

const mockRequest = jest.mocked(requestAskAnswer);
const target = { bankKey: 'python/easy', choiceIndex: 1, questionId: 'py-easy-0' };

async function askQuestion(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Your question about this card'), text);
  await fireEvent.press(screen.getByRole('button', { name: 'Ask' }));
}

afterEach(() => {
  mockRequest.mockReset();
});

describe('AskPanel', () => {
  it('keeps Ask disabled until a question is typed', async () => {
    await render(<AskPanel target={target} />);

    await fireEvent.changeText(screen.getByLabelText('Your question about this card'), '   ');
    await fireEvent.press(screen.getByRole('button', { name: 'Ask' }));

    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('sends the trimmed question and shows the answer and the questions left today', async () => {
    mockRequest.mockResolvedValueOnce({
      answer: 'b and a are one list.',
      limit: 20,
      remaining: 19,
      status: 'answered',
    });
    await render(<AskPanel target={target} />);

    await askQuestion('  Why does a change?  ');

    expect(mockRequest).toHaveBeenCalledWith(target, 'Why does a change?');
    expect(await screen.findByText('b and a are one list.')).toBeTruthy();
    expect(screen.getByText('Why does a change?')).toBeTruthy();
    expect(screen.getByText('19 questions left today')).toBeTruthy();
    expect(screen.getByLabelText('Your question about this card').props.value).toBe('');
  });

  it.each([
    ['limit', "You've used today's questions"],
    ['busy', 'Too many questions at once'],
    ['unavailable', 'No answer right now'],
  ] as const)('says why when the ask fails with %s, keeping the typed question', async (reason, text) => {
    mockRequest.mockResolvedValueOnce({ reason, status: 'failed' });
    await render(<AskPanel target={target} />);

    await askQuestion('Why?');

    expect(await screen.findByText(new RegExp(text))).toBeTruthy();
    expect(screen.getByLabelText('Your question about this card').props.value).toBe('Why?');
  });

  it('drops a reply that lands after the panel unmounts', async () => {
    let resolve: (result: AskResult) => void = () => undefined;
    mockRequest.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { unmount } = await render(<AskPanel target={target} />);
    await askQuestion('Why?');
    expect(screen.getByText('Asking…')).toBeTruthy();

    await unmount();
    await act(async () => resolve({ answer: 'late', limit: 20, remaining: 1, status: 'answered' }));

    expect(screen.queryByText('late')).toBeNull();
  });
});
