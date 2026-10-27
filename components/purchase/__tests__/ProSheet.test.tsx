// components/purchase/__tests__/ProSheet.test.tsx
// The Pro sheet on native: a dialog with one level-1 heading "Syntactical Pro", the two benefits,
// a button per product carrying the store's localized price ("A year" and "Forever" with no
// prices), the renewal note, and "Not now"; each button buys its own product id; every button is
// disabled while a purchase runs; a message shows as an alert; and paywall_viewed is recorded once
// per opening with the source it was opened from.
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import '../../auth/__tests__/preloadNativeModal';
import { trackEvent } from '../../../clients/analyticsClient';
import { ProSheet, type ProSheetSource } from '../ProSheet';

jest.mock('../../../clients/analyticsClient', () => ({ trackEvent: jest.fn() }));

const ANNUAL = 'syntactical.pro.annual';
const LIFETIME = 'syntactical.pro.lifetime';
// Localized and deliberately not the US list prices, so a hard-coded price cannot pass.
const PRICES = { [ANNUAL]: '€21,99', [LIFETIME]: '€43,99' };
const RENEWAL_NOTE = 'A year renews until you cancel; forever is one payment.';

type SheetProps = {
  isBuying: boolean;
  message: string | null;
  onBuy: jest.Mock;
  onClose: jest.Mock;
  prices: Record<string, string>;
  source: ProSheetSource;
};

function buildProps(overrides: Partial<SheetProps> = {}): SheetProps {
  return {
    isBuying: false,
    message: null,
    onBuy: jest.fn(),
    onClose: jest.fn(),
    prices: PRICES,
    source: 'settings',
    ...overrides,
  };
}

function listPaywallViews(): unknown[][] {
  return jest.mocked(trackEvent).mock.calls.filter(([name]) => name === 'paywall_viewed');
}

describe('ProSheet on native', () => {
  it('is a dialog with one level-1 heading "Syntactical Pro", both benefits, and the renewal note', async () => {
    await render(<ProSheet {...buildProps()} />);
    const dialog = screen.getByRole('dialog');
    const level1 = within(dialog)
      .getAllByRole('heading')
      .filter((heading) => (heading.props['aria-level'] ?? heading.props.accessibilityLevel) === 1);
    expect(level1).toHaveLength(1);
    expect(level1[0]).toHaveTextContent(/^Syntactical Pro$/);
    expect(within(dialog).getByText('No sponsored cards')).toBeTruthy();
    expect(within(dialog).getByText('20 asks a day')).toBeTruthy();
    expect(within(dialog).getByText(RENEWAL_NOTE)).toBeTruthy();
  });

  it("names each product button with the store's price and offers Not now", async () => {
    await render(<ProSheet {...buildProps()} />);
    expect(screen.getByRole('button', { name: 'A year for €21,99' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Forever for €43,99' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy();
    expect(screen.queryByText(/\$19\.99|\$39\.99/)).toBeNull();
  });

  it('names the buttons "A year" and "Forever" when the store gave no prices', async () => {
    await render(<ProSheet {...buildProps({ prices: {} })} />);
    expect(screen.getByRole('button', { name: 'A year' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Forever' })).toBeTruthy();
    expect(screen.queryByText(/[€$£]/)).toBeNull();
  });

  it('buys the product of the pressed button', async () => {
    const props = buildProps();
    await render(<ProSheet {...props} />);
    await fireEvent.press(screen.getByRole('button', { name: 'A year for €21,99' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Forever for €43,99' }));
    expect(props.onBuy.mock.calls).toEqual([[ANNUAL], [LIFETIME]]);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('closes on Not now', async () => {
    const props = buildProps();
    await render(<ProSheet {...props} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onBuy).not.toHaveBeenCalled();
  });

  it('disables every button while a purchase runs', async () => {
    const props = buildProps({ isBuying: true });
    await render(<ProSheet {...props} />);
    for (const name of ['A year for €21,99', 'Forever for €43,99', 'Not now']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      await fireEvent.press(button);
    }
    expect(props.onBuy).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('shows a message as an alert', async () => {
    await render(<ProSheet {...buildProps({ message: 'The purchase did not go through. Try again.' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('The purchase did not go through. Try again.');
  });

  it('records paywall_viewed once with its source, and not again when it re-renders', async () => {
    const { rerender } = await render(<ProSheet {...buildProps({ source: 'ask_limit' })} />);
    await rerender(<ProSheet {...buildProps({ isBuying: true, message: 'x', source: 'ask_limit' })} />);
    expect(listPaywallViews()).toEqual([['paywall_viewed', { source: 'ask_limit' }]]);
  });
});
