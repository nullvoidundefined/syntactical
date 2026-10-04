// The legal pages render on native, keep the owner's placeholders findable, and state the facts the code
// guarantees (deletion steps and what vendors keep).
import { render } from '@testing-library/react-native';

import DeleteAccountScreen from '../delete-account';
import PrivacyScreen from '../privacy';

describe('legal pages', () => {
  it('privacy policy has its heading and the three placeholders', async () => {
    const screen = await render(<PrivacyScreen />);

    expect(screen.getByRole('heading', { name: 'Privacy policy' })).toBeTruthy();
    expect(screen.getByText(/\[EFFECTIVE DATE\]/)).toBeTruthy();
    expect(screen.getAllByText(/\[OWNER NAME\]/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\[CONTACT EMAIL\]/).length).toBeGreaterThan(0);
  });

  it('account deletion page gives the in-app path, an email route, and what vendors keep', async () => {
    const screen = await render(<DeleteAccountScreen />);

    expect(screen.getByRole('heading', { name: 'Delete your account' })).toBeTruthy();
    expect(screen.getByText(/Type DELETE and confirm/)).toBeTruthy();
    expect(screen.getAllByText(/\[CONTACT EMAIL\]/).length).toBeGreaterThan(0);
    expect(screen.getByText(/RevenueCat customer record/)).toBeTruthy();
  });
});
