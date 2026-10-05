import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { QueryDrawer } from '../QueryDrawer';

const SOURCE = {
  quote: 'q'.repeat(30),
  title: 'Using HTTP cookies',
  url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies',
};

describe('QueryDrawer source link on native', () => {
  it('opens the source URL when pressed', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(
      <QueryDrawer
        isOpen
        query={{ explanation: 'e', title: 't' }}
        grammar="plain"
        evidenceSource={SOURCE}
        onClose={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByText('Source: Using HTTP cookies'));
    expect(openURL).toHaveBeenCalledWith(SOURCE.url);
  });
});
