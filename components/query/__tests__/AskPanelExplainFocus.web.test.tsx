// "Explain my mistake" on the web keeps keyboard and screen reader focus in the panel: the button
// goes once it has answered, so focus moves to the explanation instead of dropping to the document.
import { act, fireEvent, render, screen } from '@testing-library/react';

import { settle } from '../../../config/settle';
import { requestAskAnswer, requestMistakeExplanation } from '../../../services/ask/requestAskAnswer';
import { AskPanel } from '../AskPanel';

jest.mock('../../../services/ask/requestAskAnswer', () => ({
  requestAskAnswer: jest.fn(),
  requestMistakeExplanation: jest.fn(),
}));

const mockAsk = jest.mocked(requestAskAnswer);
const mockExplain = jest.mocked(requestMistakeExplanation);
const target = { bankKey: 'python/easy', choiceIndex: 1, questionId: 'py-easy-0' };
const EXPLANATION = 'You picked the alias.';

afterEach(() => {
  mockAsk.mockReset();
  mockExplain.mockReset();
});

describe('AskPanel, Explain my mistake focus on the web', () => {
  it('moves focus to the explanation once it has answered and the button has gone', async () => {
    mockExplain.mockResolvedValueOnce({ answer: EXPLANATION, limit: 5, remaining: 4, status: 'answered' });
    render(<AskPanel canExplainMistake target={target} />);
    const button = screen.getByRole('button', { name: 'Explain my mistake' });
    act(() => button.focus());

    await act(async () => {
      fireEvent.click(button);
    });
    await settle();

    expect(screen.queryByRole('button', { name: 'Explain my mistake' })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.textContent).toContain(EXPLANATION);
  });
});
