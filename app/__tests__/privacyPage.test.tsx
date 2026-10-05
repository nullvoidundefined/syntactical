// The privacy page describes optional passwords truthfully (B-91): the scrypt hash, the breach check
// by 5-character SHA-1 prefix, and the password hash in the deletion list.
import { render } from '@testing-library/react-native';

import PrivacyScreen from '../privacy';

describe('privacy page password wording', () => {
  it('no longer claims there is no password, and names the hash and the breach check', async () => {
    const screen = await render(<PrivacyScreen />);

    expect(screen.queryByText(/There is no password/)).toBeNull();
    expect(screen.getByText(/scrypt/)).toBeTruthy();
    expect(screen.getByText(/Have I Been Pwned/)).toBeTruthy();
    expect(screen.getByText(/first 5 characters/)).toBeTruthy();
  });

  it('lists the password hash among what deleting an account removes', async () => {
    const screen = await render(<PrivacyScreen />);

    expect(screen.getByText(/Deleting your account removes your email, your password hash,/)).toBeTruthy();
  });

  it('keeps one page title heading', async () => {
    const screen = await render(<PrivacyScreen />);

    expect(screen.getAllByRole('heading', { name: 'Privacy policy' })).toHaveLength(1);
  });
});
