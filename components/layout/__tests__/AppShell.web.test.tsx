import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppShell } from '../AppShell';

jest.mock('../../../state/useProgressSummary', () => ({
  useProgressSummary: () => ({ dailyGoal: 20, dayStreak: 3, xpToday: 12 }),
}));
jest.mock('../../../state/useIsReducedMotion', () => ({ useIsReducedMotion: () => false }));
jest.mock('../DownloadIndicator', () => ({ DownloadIndicator: () => null }));
jest.mock('../ReviewDueLink', () => ({ ReviewDueLink: () => null }));

function renderShell() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 800, width: 400, x: 0, y: 0 },
        insets: { bottom: 0, left: 0, right: 0, top: 0 },
      }}
    >
      <AppShell>
        <Text>route content</Text>
      </AppShell>
    </SafeAreaProvider>,
  );
}

describe('AppShell on the web', () => {
  it('wraps the brand bar in a banner landmark and the route content in the main landmark', () => {
    renderShell();
    expect(screen.getByRole('banner').textContent).toContain('SYNTACTICAL');
    expect(screen.getByRole('main').textContent).toBe('route content');
  });

  it('reads the day streak and XP today to a screen reader as one sentence', () => {
    renderShell();
    expect(screen.getByText('Day streak 3, 12 of 20 XP today')).toBeTruthy();
  });

  it('shows the daily goal ring as a progressbar with its value and maximum', () => {
    renderShell();
    const ring = screen.getByRole('progressbar', { name: 'Daily goal' });
    expect(ring.getAttribute('aria-valuenow')).toBe('12');
    expect(ring.getAttribute('aria-valuemax')).toBe('20');
    expect(ring.getAttribute('aria-valuetext')).toBe('12 of 20 XP');
  });

  it('makes the SYNTACTICAL mark a link named "Syntactical home"', () => {
    renderShell();
    const home = screen.getByRole('link', { name: 'Syntactical home' });
    expect(home.textContent).toBe('SYNTACTICAL');
  });

  it('links to the settings route and no longer shows the answer streak', () => {
    renderShell();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('banner').textContent).not.toMatch(/best/i);
  });

  // Dialog overlays are hosted in document.body (ModalOverlay), so the app bar needs no z-index of
  // its own; one would paint the bar above the paywall and delete-account overlays.
  it('leaves the app bar unstacked so modal overlays cover it', () => {
    renderShell();
    expect(screen.getByRole('banner').style.zIndex).toBe('');
  });

  // The bar's background and border stay full width; its contents share the page column's width
  // and horizontal padding so the logo and the account control line up with the column. Jest stubs
  // the stylesheet, so class names are not in the DOM here: the structure is checked in the DOM,
  // the class names in the source, and the real geometry in e2e/specs/appBarLayout.spec.ts.
  it('keeps the app bar contents in one container inside the banner', () => {
    renderShell();
    const banner = screen.getByRole('banner');
    const inner = screen.getByRole('link', { name: 'Syntactical home' }).parentElement as HTMLElement;
    expect(inner).not.toBe(banner);
    expect(inner.parentElement).toBe(banner);
    expect(inner.contains(screen.getByRole('link', { name: 'Settings' }))).toBe(true);
  });

  it('gives the contents container the page column max width and the bar its padding', () => {
    const source = readFileSync(join(__dirname, '..', 'AppShell.tsx'), 'utf8');
    expect(source).toMatch(/role="banner" className="[^"]*\bpx-4\b[^"]*"/);
    expect(source).not.toMatch(/role="banner" className="[^"]*max-w-/);
    expect(source).toMatch(/className="mx-auto w-full max-w-xl [^"]*flex-row/);
  });
});
