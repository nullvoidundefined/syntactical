// app/__tests__/legalPagesAdMob.test.tsx
// The privacy and account deletion pages describe the AdMob cards that ship on iPhone and Android: always
// non-personalised and never for tracking; Google AdMob receives the IP address and may infer an approximate
// location from it, so the page no longer claims no approximate location; and what Google keeps after an
// account is deleted. The web half is pinned by Task 6.13's legalPagesSponsored.test.tsx.
import { render } from '@testing-library/react-native';

import DeleteAccountScreen from '../delete-account';
import PrivacyScreen from '../privacy';

describe('legal pages and AdMob', () => {
  it('names Google AdMob as a processor of the non-personalised cards', async () => {
    const screen = await render(<PrivacyScreen />);
    expect(screen.getByText(/^Google AdMob:/)).toBeTruthy();
    expect(screen.getByText(/always non-personalised/)).toBeTruthy();
    expect(screen.getByText(/never asks to track you/)).toBeTruthy();
  });

  it('says Google AdMob receives the IP address and may infer an approximate location', async () => {
    const screen = await render(<PrivacyScreen />);
    expect(
      screen.getByText(/Google AdMob receives your IP address, from which it may infer an approximate location/),
    ).toBeTruthy();
    expect(screen.queryByText(/precise or approximate location/)).toBeNull();
  });

  it('lists what Google AdMob keeps after deletion', async () => {
    const privacy = await render(<PrivacyScreen />);
    expect(privacy.getByText(/Google AdMob's records of the sponsored cards it served/)).toBeTruthy();
    const deletion = await render(<DeleteAccountScreen />);
    expect(deletion.getByText(/Google AdMob's records of the sponsored cards it served/)).toBeTruthy();
  });
});
