// components/sponsor/__tests__/PrivacySettingsRow.test.tsx
// Settings offers "Privacy settings" only when the consent SDK says the user must be able to reopen the
// form (EEA and UK), and pressing it reopens the form.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { PrivacySettingsRow } from '../PrivacySettingsRow';

const mockSponsor = { privacyOptionsRequired: false, showPrivacyOptions: jest.fn(() => Promise.resolve()) };

jest.mock('../../../state/SponsorProvider', () => ({ useSponsor: () => mockSponsor }));

describe('PrivacySettingsRow', () => {
  it('renders nothing when privacy options are not required', async () => {
    mockSponsor.privacyOptionsRequired = false;
    await render(<PrivacySettingsRow />);
    expect(screen.queryByRole('button', { name: 'Privacy settings' })).toBeNull();
  });

  it('reopens the consent form when required', async () => {
    mockSponsor.privacyOptionsRequired = true;
    await render(<PrivacySettingsRow />);
    await fireEvent.press(screen.getByRole('button', { name: 'Privacy settings' }));
    expect(mockSponsor.showPrivacyOptions).toHaveBeenCalledTimes(1);
  });
});
