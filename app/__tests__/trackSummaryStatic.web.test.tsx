// app/__tests__/trackSummaryStatic.web.test.tsx
// The track route in the static web export. The page carries the track summary below the difficulty step in the
// build-time render and keeps it after mount, so both the HTML a crawler reads and the DOM a search engine renders
// after running JavaScript hold the tagline, topics, and bank sizes, under the step's one h1.
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import { BUNDLED_MANIFEST } from '../../services/content/bundledManifest.generated';
import DifficultyScreen from '../[language]/index';

const GO = BUNDLED_MANIFEST.languages.find(({ id }) => id === 'go')!;

jest.mock('expo-router', () =>
  require('../../config/buildExpoRouterMock').buildExpoRouterMock({ readParams: () => ({ language: 'go' }) }),
);
jest.mock('../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => require('../../services/content/bundledManifest.generated').BUNDLED_MANIFEST,
}));
jest.mock('../../state/useQuestionBank', () => ({ useQuestionBank: () => ({ status: 'loading' }) }));
jest.mock('../../state/useIsOnline', () => ({ useIsOnline: () => true }));
// Head needs the provider Expo Router's root mounts; TrackSummary.web.test.tsx checks the page head.
jest.mock('../../components/seo/PageHead', () => ({ PageHead: () => null }));

describe('track route, before and after hydration', () => {
  it('carries the summary below the difficulty step in the build-time render', () => {
    const html = renderToString(<DifficultyScreen />);
    expect(html).toContain('About Go');
    expect(html.indexOf('Select difficulty')).toBeLessThan(html.indexOf('About Go'));
  });

  it('keeps the summary after mount, below the one h1', () => {
    render(<DifficultyScreen />);
    expect(screen.getByRole('heading', { level: 2, name: 'About Go' })).toBeTruthy();
    expect(screen.getByText(GO.tagline)).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Topics' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Banks' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Step 2 / Select difficulty Go');
  });
});
