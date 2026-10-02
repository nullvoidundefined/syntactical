import { Text } from 'react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import RootLayout from '../_layout';
import NotFoundScreen from '../+not-found';

function RoundRouteProbe() {
  return <Text>round route</Text>;
}

describe('routing', () => {
  it('resolves a language id that did not exist at build time', async () => {
    await renderRouter(
      { _layout: RootLayout, '[language]/[difficulty]': RoundRouteProbe, '+not-found': NotFoundScreen },
      { initialUrl: '/elixir/easy' },
    );
    expect(await screen.findByText('round route')).toBeTruthy();
  });

  it('renders the not-found screen with a menu link for an unmatched path', async () => {
    await renderRouter({ _layout: RootLayout, '+not-found': NotFoundScreen }, { initialUrl: '/a/b/c' });
    expect(await screen.findByText('Not found')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to menu' })).toBeTruthy();
  });
});
