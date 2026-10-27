// components/sponsor/__tests__/SponsoredCard.test.tsx
// The native sponsored card with the house feed: nothing for a Pro user or while Pro status loads (not even
// the reserved slot), the house card for a free user inside the fixed-height slot with ad_shown once, and
// its button opens the Pro sheet with source house_card. A
// guest who buys from the sheet is sent to sign in and back; a signed-in user buys through area 4's
// ProOffer (run for real against a stubbed usePurchases), so a failed purchase shows ProOffer's message.
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { createQueryClient } from '../../../config/queryClient';
import { settle } from '../../../config/settle';
import { SPONSOR_SLOT_HEIGHT } from '../../../constants/sponsor';
import { SponsorProvider } from '../../../state/SponsorProvider';
import type { ProStatusState } from '../../../state/useProStatus';
import type { PurchasesState } from '../../../state/usePurchases';
import type { ProSheetSource } from '../../purchase/ProSheet';
import { SponsoredCard } from '../SponsoredCard';

const mockProStatus: { current: ProStatusState } = { current: { status: 'guest' } };
const mockAuth: { userId: string | null } = { userId: null };
const mockTrackEvent = jest.fn();
const mockPush = jest.fn();
const mockBuy = jest.fn();
const mockConfirm = jest.fn();

jest.mock('../../../state/useProStatus', () => ({ useProStatus: () => mockProStatus.current }));
jest.mock('../../../state/AuthProvider', () => ({
  useAuth: () => ({ isHydrated: true, isSignedIn: mockAuth.userId !== null }),
  useSignedInUserId: () => mockAuth.userId,
}));
jest.mock('../../../clients/analyticsClient', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));
// The whole PurchasesState, as area 4's Task 4.5 leaves it; ProOffer reads buy, confirm, and prices.
jest.mock('../../../state/usePurchases', () => ({
  usePurchases: (): PurchasesState => ({ buy: mockBuy, confirm: mockConfirm, prices: {}, restore: jest.fn() }),
}));
jest.mock('expo-router', () => ({
  ...require('../../../config/buildExpoRouterMock').buildExpoRouterMock({
    push: (...args: unknown[]) => mockPush(...args),
  }),
  usePathname: () => '/python',
}));
// ProSheet (area 4, Task 4.3) is replaced by a stand-in that exposes the props it is given, typed as the
// real ones; ProOffer imports the same module, so it renders this stand-in too.
jest.mock('../../purchase/ProSheet', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    ProSheet: ({
      message,
      onBuy,
      onClose,
      source,
    }: {
      message: string | null;
      onBuy: (productId: string) => void;
      onClose: () => void;
      source: ProSheetSource;
    }) => (
      <View>
        <Text>{`pro-sheet ${source}`}</Text>
        {message === null ? null : <Text>{message}</Text>}
        <Pressable role="button" aria-label="Buy annual" onPress={() => onBuy('syntactical.pro.annual')} />
        <Pressable role="button" aria-label="Not now" onPress={onClose} />
      </View>
    ),
  };
});

async function renderCard(onShown = jest.fn()) {
  await render(
    <QueryClientProvider client={createQueryClient()}>
      <SponsorProvider>
        <SponsoredCard placement="results" onShown={onShown} />
      </SponsorProvider>
    </QueryClientProvider>,
  );
  await settle();
  return onShown;
}

beforeEach(() => {
  mockProStatus.current = { status: 'guest' };
  mockAuth.userId = null;
  // No direct sponsor: SponsorProvider's sponsor.json request answers 404, so the house card stays.
  global.fetch = jest.fn((url: unknown) =>
    Promise.resolve({
      headers: { get: () => null },
      ok: false,
      redirected: false,
      status: 404,
      text: () => Promise.resolve(''),
      url: String(url),
    }),
  ) as unknown as typeof fetch;
});

describe('SponsoredCard with the house feed on native', () => {
  it('renders nothing and reports nothing while Pro status loads', async () => {
    mockProStatus.current = { status: 'loading' };
    const onShown = await renderCard();
    expect(screen.queryByText('Sponsored')).toBeNull();
    expect(mockTrackEvent).not.toHaveBeenCalled();
    expect(onShown).not.toHaveBeenCalled();
  });

  it('renders nothing for a Pro user, not even the reserved slot', async () => {
    mockProStatus.current = { expiresAt: null, isPro: true, product: 'lifetime', status: 'ready' };
    await renderCard();
    expect(screen.queryByText('Syntactical Pro')).toBeNull();
    expect(screen.queryByTestId('sponsored-slot')).toBeNull();
  });

  it('renders the house card inside the fixed-height slot', async () => {
    await renderCard();
    const slot = screen.getByTestId('sponsored-slot');
    expect(slot).toHaveStyle({ height: SPONSOR_SLOT_HEIGHT });
    expect(within(slot).getByText('Syntactical Pro')).toBeTruthy();
  });

  it('shows the house card to a guest, reports ad_shown once, and tells the host once', async () => {
    const onShown = await renderCard();
    expect(screen.getByText('Syntactical Pro')).toBeTruthy();
    expect(screen.getByText('No sponsored cards. 20 asks a day.')).toBeTruthy();
    expect(mockTrackEvent.mock.calls).toEqual([['ad_shown', { placement: 'results', source: 'house' }]]);
    expect(onShown).toHaveBeenCalledTimes(1);
  });

  it('reports ad_clicked and opens the Pro sheet with source house_card, which Not now closes', async () => {
    await renderCard();
    await fireEvent.press(screen.getByRole('link', { name: 'Sponsored: Syntactical Pro. See Pro' }));
    expect(mockTrackEvent).toHaveBeenLastCalledWith('ad_clicked', { placement: 'results', source: 'house' });
    expect(screen.getByText('pro-sheet house_card')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('pro-sheet house_card')).toBeNull();
  });

  it('sends a guest who buys to sign in, returning to this route, without calling the store', async () => {
    await renderCard();
    await fireEvent.press(screen.getByRole('link', { name: 'Sponsored: Syntactical Pro. See Pro' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Buy annual' }));
    expect(mockBuy).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({ params: { returnTo: '/python' }, pathname: '/sign-in' });
    expect(screen.queryByText('pro-sheet house_card')).toBeNull();
  });

  it('buys through ProOffer for a signed-in free user and shows its unavailable message', async () => {
    mockAuth.userId = 'a6f1d1c2-0000-4000-8000-00000000000a';
    mockProStatus.current = { expiresAt: null, isPro: false, product: null, status: 'ready' };
    mockBuy.mockResolvedValueOnce('unavailable');
    await renderCard();
    await fireEvent.press(screen.getByRole('link', { name: 'Sponsored: Syntactical Pro. See Pro' }));
    expect(screen.getByText('pro-sheet house_card')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Buy annual' }));
    await settle();
    expect(mockBuy).toHaveBeenCalledWith('syntactical.pro.annual');
    expect(screen.getByText('The purchase did not go through. Try again.')).toBeTruthy();
  });

  it('closes the sheet once the purchase is confirmed', async () => {
    mockAuth.userId = 'a6f1d1c2-0000-4000-8000-00000000000a';
    mockProStatus.current = { expiresAt: null, isPro: false, product: null, status: 'ready' };
    mockBuy.mockResolvedValueOnce('unlocked');
    await renderCard();
    await fireEvent.press(screen.getByRole('link', { name: 'Sponsored: Syntactical Pro. See Pro' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Buy annual' }));
    await settle();
    expect(screen.queryByText('pro-sheet house_card')).toBeNull();
  });
});
