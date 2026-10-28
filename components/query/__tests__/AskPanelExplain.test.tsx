// "Explain my mistake" in the Ask panel: shown only when the host says the answer was wrong, one
// tap asks the server to explain the learner's choice for this card, with no typing. The
// explanation shows where an Ask answer does, with "<remaining> of <limit> left today", and the
// button goes once it has answered. While it runs it says so and neither button sends again. A
// failure says why exactly as an Ask failure does, and at the free daily limit "See Pro" opens the
// Pro offer from ask_limit. A reply that lands after the panel is gone is dropped.
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { requestAskAnswer, requestMistakeExplanation } from '../../../services/ask/requestAskAnswer';
import type { AskResult } from '../../../services/ask/types/AskResult';
import { AskPanel } from '../AskPanel';

jest.mock('../../../services/ask/requestAskAnswer', () => ({
  requestAskAnswer: jest.fn(),
  requestMistakeExplanation: jest.fn(),
}));
// The offer's own buy flow is pinned in ProOffer.test.tsx; here it only has to open from ask_limit.
jest.mock('../../purchase/ProOffer', () => ({
  ProOffer: ({ source }: { source: string }) =>
    require('react').createElement(require('react-native').Text, null, `Pro offer from ${source}`),
}));

const mockAsk = jest.mocked(requestAskAnswer);
const mockExplain = jest.mocked(requestMistakeExplanation);
const target = { bankKey: 'python/easy', choiceIndex: 1, questionId: 'py-easy-0' };
const EXPLAIN = 'Explain my mistake';
const FREE_LIMIT = "That is the free tier's 5 for today. Pro has 20.";

async function explain() {
  await fireEvent.press(screen.getByRole('button', { name: EXPLAIN }));
}

afterEach(() => {
  mockAsk.mockReset();
  mockExplain.mockReset();
});

describe('AskPanel, Explain my mistake', () => {
  it('shows no Explain my mistake button unless the host says the answer was wrong', async () => {
    await render(<AskPanel target={target} />);

    expect(screen.queryByRole('button', { name: EXPLAIN })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ask' })).toBeTruthy();
  });

  it('asks the server to explain this card with one tap and shows the answer where an ask answer goes', async () => {
    mockExplain.mockResolvedValueOnce({ answer: 'You picked the alias.', limit: 5, remaining: 4, status: 'answered' });
    await render(<AskPanel canExplainMistake target={target} />);

    await explain();

    expect(mockExplain).toHaveBeenCalledWith(target);
    expect(mockAsk).not.toHaveBeenCalled();
    expect(await screen.findByText('You picked the alias.')).toBeTruthy();
    expect(screen.getByText(EXPLAIN)).toBeTruthy();
    expect(screen.getByText('4 of 5 left today')).toBeTruthy();
    expect(screen.queryByRole('button', { name: EXPLAIN })).toBeNull();
    expect(screen.getByLabelText('Your question about this card')).toBeTruthy();
  });

  it('says it is explaining and sends nothing more while the explanation runs', async () => {
    let resolve: (result: AskResult) => void = () => undefined;
    mockExplain.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await render(<AskPanel canExplainMistake target={target} />);
    await fireEvent.changeText(screen.getByLabelText('Your question about this card'), 'Why?');

    await explain();

    expect(screen.getByText('Explaining…')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: EXPLAIN }));
    await fireEvent.press(screen.getByRole('button', { name: 'Ask' }));
    expect(mockExplain).toHaveBeenCalledTimes(1);
    expect(mockAsk).not.toHaveBeenCalled();
    await act(async () => resolve({ answer: 'Because.', limit: 5, remaining: 4, status: 'answered' }));
    expect(screen.getByText('Because.')).toBeTruthy();
  });

  it("tells a free learner at the limit the free tier's 5 and opens the Pro offer from See Pro", async () => {
    mockExplain.mockResolvedValueOnce({ limit: 5, proLimit: 20, reason: 'limit', status: 'failed', tier: 'free' });
    await render(<AskPanel canExplainMistake target={target} />);

    await explain();

    expect(await screen.findByText(FREE_LIMIT)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'See Pro' }));
    expect(screen.getByText('Pro offer from ask_limit')).toBeTruthy();
    expect(screen.getByRole('button', { name: EXPLAIN })).toBeTruthy();
  });

  it("tells a Pro learner at the limit the day's limit, with no See Pro", async () => {
    mockExplain.mockResolvedValueOnce({ limit: 20, proLimit: 20, reason: 'limit', status: 'failed', tier: 'pro' });
    await render(<AskPanel canExplainMistake target={target} />);

    await explain();

    expect(await screen.findByText("That is today's 20.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'See Pro' })).toBeNull();
  });

  it.each([
    [{ reason: 'busy', status: 'failed' }, 'Too many questions at once'],
    [{ reason: 'unavailable', status: 'failed' }, 'No answer right now'],
  ] as [AskResult, string][])('says why when the explanation fails (%o) and keeps the button', async (result, text) => {
    mockExplain.mockResolvedValueOnce(result);
    await render(<AskPanel canExplainMistake target={target} />);

    await explain();

    expect(await screen.findByText(new RegExp(text))).toBeTruthy();
    expect(screen.getByRole('button', { name: EXPLAIN })).toBeTruthy();
  });

  it('drops an explanation that lands after the panel unmounts', async () => {
    let resolve: (result: AskResult) => void = () => undefined;
    mockExplain.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { unmount } = await render(<AskPanel canExplainMistake target={target} />);
    await explain();

    await unmount();
    await act(async () => resolve({ answer: 'late', limit: 20, remaining: 1, status: 'answered' }));

    expect(screen.queryByText('late')).toBeNull();
  });
});
