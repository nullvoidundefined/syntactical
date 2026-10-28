// The account deletion page states what deleting removes and what vendors keep, as the server does it:
// study notes cascade with the user, and Anthropic and OpenAI keep their copies under their own terms.
import { render } from '@testing-library/react-native';

import DeleteAccountScreen from '../delete-account';

describe('account deletion page facts checked against the code', () => {
  it('lists weekly study notes among what is deleted', async () => {
    const screen = await render(<DeleteAccountScreen />);

    expect(screen.getByText('Your answers, daily progress, daily goal changes, and weekly study notes.')).toBeTruthy();
  });

  it('lists the Anthropic and OpenAI copies among what is kept', async () => {
    const screen = await render(<DeleteAccountScreen />);

    expect(
      screen.getByText(
        /^Questions you asked about a card, the choices you sent with Explain my mistake, and the weekly summaries behind your study notes, kept by Anthropic, and by OpenAI when a request was sent to it, under their API data-retention terms\./,
      ),
    ).toBeTruthy();
  });
});
