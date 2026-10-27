// app/__tests__/bankTitlesStatic.web.test.tsx
// The bank route in the static web export. The page carries "What this bank covers" and the bank's titles below the
// topic step in the build-time render and keeps them after mount, under the step's one h1.
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import { BANK_TITLES } from '../../services/content/bankTitles.generated';
import TopicScreen from '../[language]/[difficulty]/index';

jest.mock('expo-router', () =>
  require('../../config/buildExpoRouterMock').buildExpoRouterMock({
    readParams: () => ({ difficulty: 'medium', language: 'python' }),
  }),
);
jest.mock('../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => require('../../services/content/bundledManifest.generated').BUNDLED_MANIFEST,
}));
jest.mock('../../state/useQuestionBank', () => ({ useQuestionBank: () => ({ status: 'loading' }) }));
// Head needs the provider Expo Router's root mounts; BankTitles.web.test.tsx checks the page head.
jest.mock('../../components/seo/PageHead', () => ({ PageHead: () => null }));

describe('bank route, before and after hydration', () => {
  it('carries the bank titles below the topic step in the build-time render', () => {
    const html = renderToString(<TopicScreen />);
    expect(html).toContain('What this bank covers');
    expect(html.indexOf('Select topic')).toBeLessThan(html.indexOf('What this bank covers'));
  });

  it('keeps the bank titles after mount, below the one h1', () => {
    render(<TopicScreen />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Step 3 / Select topic Python Medium');
    expect(screen.getByRole('heading', { level: 2, name: 'What this bank covers' })).toBeTruthy();
    expect(screen.getByText(BANK_TITLES['python/medium'][0])).toBeTruthy();
  });
});
