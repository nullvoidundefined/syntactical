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
  it('shows the day streak in the header and the manifest languages on the home route', async () => {
    await renderRouter(ROUTES, { initialUrl: '/' });
    await waitFor(() => expect(screen.queryByText('Python')).not.toBeNull());
    expect(screen.queryByText(/^Day streak 0, 0 of 20 XP today$/)).not.toBeNull();
  });

  it('hides the stats section on the home route until the first answer, leaving one h1', async () => {
    await renderRouter(ROUTES, { initialUrl: '/' });
    await waitFor(() => expect(screen.queryByText('Python')).not.toBeNull());
    expect(screen.queryByText('Answer streak')).toBeNull();
    expect(screen.queryByText('Lifetime accuracy')).toBeNull();
    expect(screen.queryByText('Weak spots this week')).toBeNull();
    const levels = screen.getAllByRole('heading').map((heading) => heading.props['aria-level']);
    expect(levels).toEqual([1, 2]);
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

  it('renders the not-found screen for /quality, the removed Content quality page', async () => {
    await renderRouter(ROUTES, { initialUrl: '/quality' });
    await waitFor(() => expect(screen.queryByText('Not found')).not.toBeNull());
    expect(screen.queryByText('Content quality')).toBeNull();
  });

  it('shows no Content quality link on the home page and keeps one h1', async () => {
    await renderRouter(ROUTES, { initialUrl: '/' });
    await waitFor(() => expect(screen.queryByText('Python')).not.toBeNull());
    expect(screen.queryByRole('link', { name: 'Content quality' })).toBeNull();
    expect(screen.queryByText('Content quality')).toBeNull();
    const h1s = screen.getAllByRole('heading').filter((heading) => heading.props['aria-level'] === 1);
    expect(h1s).toHaveLength(1);
  });
});
