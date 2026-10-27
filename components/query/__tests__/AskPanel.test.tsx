// "Ask about this card": sends the trimmed question for this card, shows the answer and
// "<remaining> of <limit> left today", says why when there is no answer, and at the daily limit
// branches on the tier the server names: a free learner hears the free tier's limit and the Pro
// limit, whatever their numbers, with a "See Pro" button that opens the Pro offer from ask_limit;
// a Pro learner hears the day's limit. A reply that lands after it is gone is dropped.
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { requestAskAnswer } from '../../../services/ask/requestAskAnswer';
import type { AskResult } from '../../../services/ask/types/AskResult';
import { AskPanel } from '../AskPanel';

jest.mock('../../../services/ask/requestAskAnswer', () => ({ requestAskAnswer: jest.fn() }));
// The offer's own buy flow is pinned in ProOffer.test.tsx; here it only has to open from ask_limit.
jest.mock('../../purchase/ProOffer', () => ({
  ProOffer: ({ source }: { source: string }) =>
    require('react').createElement(require('react-native').Text, null, `Pro offer from ${source}`),
}));

const mockRequest = jest.mocked(requestAskAnswer);
const target = { bankKey: 'python/easy', choiceIndex: 1, questionId: 'py-easy-0' };
const FREE_LIMIT = "That is the free tier's 5 for today. Pro has 20.";
const LIMIT_UNNAMED = "You've used today's questions. They reset at midnight UTC.";

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

  it.each([
    [5, 4, '4 of 5 left today'],
    [20, 19, '19 of 20 left today'],
    [20, 0, '0 of 20 left today'],
  ])('sends the trimmed question and shows the answer with a limit of %i', async (limit, remaining, left) => {
    mockRequest.mockResolvedValueOnce({ answer: 'b and a are one list.', limit, remaining, status: 'answered' });
    await render(<AskPanel target={target} />);

    await askQuestion('  Why does a change?  ');

    expect(mockRequest).toHaveBeenCalledWith(target, 'Why does a change?');
    expect(await screen.findByText('b and a are one list.')).toBeTruthy();
    expect(screen.getByText('Why does a change?')).toBeTruthy();
    expect(screen.getByText(left)).toBeTruthy();
    expect(screen.getByLabelText('Your question about this card').props.value).toBe('');
  });

  it("tells a free learner at the limit the free tier's 5 and opens the Pro offer from See Pro", async () => {
    mockRequest.mockResolvedValueOnce({ limit: 5, proLimit: 20, reason: 'limit', status: 'failed', tier: 'free' });
    await render(<AskPanel target={target} />);

    await askQuestion('Why?');

    expect(await screen.findByText(FREE_LIMIT)).toBeTruthy();
    expect(screen.queryByText('Pro offer from ask_limit')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'See Pro' }));
    expect(screen.getByText('Pro offer from ask_limit')).toBeTruthy();
    expect(screen.getByLabelText('Your question about this card').props.value).toBe('Why?');
  });

  it.each([
    [{ limit: 3, proLimit: 20, tier: 'free' }, "That is the free tier's 3 for today. Pro has 20."],
    [{ limit: 5, proLimit: 30, tier: 'free' }, "That is the free tier's 5 for today. Pro has 30."],
    [{ limit: 5, tier: 'free' }, "That is the free tier's 5 for today."],
    [{ tier: 'free' }, LIMIT_UNNAMED],
  ] as [Partial<Extract<AskResult, { reason: 'limit' }>>, string][])(
    'keys the free-tier copy and See Pro on the tier, not the number (%o)',
    async (named, text) => {
      mockRequest.mockResolvedValueOnce({ ...named, reason: 'limit', status: 'failed' });
      await render(<AskPanel target={target} />);

      await askQuestion('Why?');

      expect(await screen.findByText(text)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'See Pro' })).toBeTruthy();
    },
  );

  it.each([
    [{ limit: 20, proLimit: 20, tier: 'pro' }, "That is today's 20."],
    [{ limit: 5, proLimit: 20, tier: 'pro' }, "That is today's 5."],
    [{ limit: 20 }, "That is today's 20."],
  ] as [Partial<Extract<AskResult, { reason: 'limit' }>>, string][])(
    "tells a learner who is not on the free tier the day's limit, with no See Pro (%o)",
    async (named, text) => {
      mockRequest.mockResolvedValueOnce({ ...named, reason: 'limit', status: 'failed' });
      await render(<AskPanel target={target} />);

      await askQuestion('Why?');

      expect(await screen.findByText(text)).toBeTruthy();
      expect(screen.queryByText(/free tier/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'See Pro' })).toBeNull();
    },
  );

  it.each([
    [{ reason: 'limit', status: 'failed' }, "You've used today's questions"],
    [{ reason: 'busy', status: 'failed' }, 'Too many questions at once'],
    [{ reason: 'unavailable', status: 'failed' }, 'No answer right now'],
  ] as [AskResult, string][])('says why when the ask fails (%o), keeping the typed question', async (result, text) => {
    mockRequest.mockResolvedValueOnce(result);
    await render(<AskPanel target={target} />);

    await askQuestion('Why?');

    expect(await screen.findByText(new RegExp(text))).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'See Pro' })).toBeNull();
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
