import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import DifficultyScreen from '../[language]/index';
import RootLayout from '../_layout';
import NotFoundScreen from '../+not-found';
import LanguageScreen from '../index';

jest.mock('../../state/useIsOnline', () => ({ useIsOnline: () => true }));

const ROUTES = {
  '+not-found': NotFoundScreen,
  '[language]/index': DifficultyScreen,
  _layout: RootLayout,
  index: LanguageScreen,
};

describe('menu routes', () => {
  it('shows the streak readout and the manifest languages on the home route', async () => {
    await renderRouter(ROUTES, { initialUrl: '/' });
    expect(await screen.findByText('Python')).toBeTruthy();
    expect(screen.getByText(/streak/i)).toBeTruthy();
  });

  it('navigates from a language to its difficulty step', async () => {
    const router = await renderRouter(ROUTES, { initialUrl: '/' });
    await fireEvent.press(await screen.findByText('Postgres'));
    expect(await screen.findByText('Medium')).toBeTruthy();
    expect(router.getPathname()).toBe('/postgres');
  });

  it('renders the not-found screen for a language the manifest does not list', async () => {
    await renderRouter(ROUTES, { initialUrl: '/cobol' });
    expect(await screen.findByText('Not found')).toBeTruthy();
  });
});
