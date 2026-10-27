// "See Pro" at the free Ask limit on native, where the Pro offer opens over the drawer from the
// panel itself: once the offer closes because the learner is now Pro, the free tier's limit copy
// and See Pro go, so a new Pro learner is not offered the other product; an offer closed without
// buying leaves them in place.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { requestAskAnswer } from '../../../services/ask/requestAskAnswer';
import { AskPanel } from '../AskPanel';

jest.mock('../../../services/ask/requestAskAnswer', () => ({ requestAskAnswer: jest.fn() }));
// The offer's own buy flow is pinned in ProOffer.test.tsx; here it only reports how it closed.
jest.mock('../../purchase/ProOffer', () => require('./fakeProOffer'));

const mockRequest = jest.mocked(requestAskAnswer);
const target = { bankKey: 'python/easy', choiceIndex: 1, questionId: 'py-easy-0' };
const FREE_LIMIT = "That is the free tier's 5 for today. Pro has 20.";

async function reachFreeLimitAndOpenOffer() {
  mockRequest.mockResolvedValueOnce({ limit: 5, proLimit: 20, reason: 'limit', status: 'failed', tier: 'free' });
  await render(<AskPanel target={target} />);
  await fireEvent.changeText(screen.getByLabelText('Your question about this card'), 'Why?');
  await fireEvent.press(screen.getByRole('button', { name: 'Ask' }));
  expect(await screen.findByText(FREE_LIMIT)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'See Pro' }));
}

afterEach(() => {
  mockRequest.mockReset();
});

describe('AskPanel after the Pro offer closes', () => {
  it('drops the free-limit copy and See Pro once the offer closes as unlocked', async () => {
    await reachFreeLimitAndOpenOffer();

    await fireEvent.press(screen.getByRole('button', { name: 'Unlock' }));

    expect(screen.queryByText(FREE_LIMIT)).toBeNull();
    expect(screen.queryByRole('button', { name: 'See Pro' })).toBeNull();
    expect(screen.getByLabelText('Your question about this card').props.value).toBe('Why?');
  });

  it('keeps the free-limit copy and See Pro when the offer closes without a purchase', async () => {
    await reachFreeLimitAndOpenOffer();

    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));

    expect(screen.getByText(FREE_LIMIT)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'See Pro' })).toBeTruthy();
  });
});
