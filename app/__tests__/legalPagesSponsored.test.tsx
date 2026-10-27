// app/__tests__/legalPagesSponsored.test.tsx
// The privacy page describes the sponsored cards the sponsored-card PR ships: free users see them, Pro
// removes them, the website's text cards come from EthicalAds without cookies, and seeing or pressing a card
// is a usage event. The old "no ads" claim is gone. The AdMob statements are pinned by Task 6.18's test.
import { render } from '@testing-library/react-native';

import PrivacyScreen from '../privacy';

describe('privacy page and the web sponsored cards', () => {
  it('no longer claims the app has no ads', async () => {
    const screen = await render(<PrivacyScreen />);
    expect(screen.queryByText(/The app has no ads/)).toBeNull();
  });

  it('says free users see sponsored cards and Pro removes them', async () => {
    const screen = await render(<PrivacyScreen />);
    expect(screen.getByText(/Free users see sponsored cards/)).toBeTruthy();
    expect(screen.getByText(/Pro removes them/)).toBeTruthy();
  });

  it('names EthicalAds as the website card processor, without cookies', async () => {
    const screen = await render(<PrivacyScreen />);
    expect(
      screen.getByText(/^EthicalAds: serves the text sponsored cards on the website, without cookies/),
    ).toBeTruthy();
  });

  it('counts seeing or pressing a sponsored card among the usage events', async () => {
    const screen = await render(<PrivacyScreen />);
    expect(screen.getByText(/seeing or pressing a sponsored card/)).toBeTruthy();
  });
});
