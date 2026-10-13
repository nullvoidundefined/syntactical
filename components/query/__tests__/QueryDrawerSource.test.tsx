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
        isAnswered
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

  it('opens a doc link URL when pressed', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const docs = [{ title: 'Set-Cookie', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie' }];
    await render(
      <QueryDrawer
        isAnswered={false}
        isOpen
        query={{ docs, explanation: 'e', title: 't' }}
        grammar="plain"
        onClose={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByText('Set-Cookie'));
    expect(openURL).toHaveBeenCalledWith(docs[0].url);
  });

  it('hides the source link before an answer', async () => {
    await render(
      <QueryDrawer
        isAnswered={false}
        isOpen
        query={{ explanation: 'e', title: 't' }}
        grammar="plain"
        evidenceSource={SOURCE}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByText('Source: Using HTTP cookies')).toBeNull();
  });
});
