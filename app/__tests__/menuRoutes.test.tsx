import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

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
    await waitFor(() => expect(screen.queryByText('Python')).not.toBeNull());
    expect(screen.queryByText(/streak/i)).not.toBeNull();
  });

  it('navigates from a language to its difficulty step', async () => {
    const routerRender = renderRouter(ROUTES, { initialUrl: '/' });
    await routerRender;
    await waitFor(() => expect(screen.queryByText('Postgres')).not.toBeNull());
    await fireEvent.press(screen.getByText('Postgres'));
    await waitFor(() => expect(screen.queryByText('Medium')).not.toBeNull());
    expect(routerRender.getPathname()).toBe('/postgres');
  });

  it('renders the not-found screen for a language the manifest does not list', async () => {
    await renderRouter(ROUTES, { initialUrl: '/cobol' });
    await waitFor(() => expect(screen.queryByText('Not found')).not.toBeNull());
  });
});
