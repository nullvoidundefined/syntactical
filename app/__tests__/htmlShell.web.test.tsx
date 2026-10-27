// app/__tests__/htmlShell.web.test.tsx
// The static export's document shell: English, UTF-8, a mobile viewport, the obsidian theme colour (the token in
// tailwind.config.js), no title of its own (each page sets one through PageHead), the page inside the body, and the
// EthicalAds client script only when extra.ethicalAdsPublisher is configured.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';

import { setExpoExtra } from '../../config/expoConstantsMock';
import Root from '../+html';

const DEFAULT_EXTRA = { contentBaseUrl: 'https://example.test/content/' };
const ETHICAL_ADS_SCRIPT = 'https://media.ethicalads.io/media/client/ethicalads.min.js';
const OBSIDIAN = /obsidian: '(#[0-9a-f]{6})'/.exec(
  readFileSync(join(__dirname, '..', '..', 'tailwind.config.js'), 'utf8'),
)?.[1];

function renderShell(extra: Record<string, unknown>): Document {
  setExpoExtra({ ...DEFAULT_EXTRA, ...extra });
  const markup = renderToStaticMarkup(
    <Root>
      <p id="page">page</p>
    </Root>,
  );
  return new DOMParser().parseFromString(`<!DOCTYPE html>${markup}`, 'text/html');
}

describe('app/+html.tsx', () => {
  afterEach(() => setExpoExtra(DEFAULT_EXTRA));

  it('declares the language, charset, viewport, and theme colour, and leaves the title to each page', () => {
    const shell = renderShell({});
    expect(shell.documentElement.getAttribute('lang')).toBe('en');
    expect(shell.querySelector('meta[charset]')?.getAttribute('charset')?.toLowerCase()).toBe('utf-8');
    expect(shell.querySelector('meta[name="viewport"]')?.getAttribute('content')).toBe(
      'width=device-width, initial-scale=1, shrink-to-fit=no',
    );
    expect(OBSIDIAN).toBe('#05060a');
    expect(shell.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(OBSIDIAN);
    expect(shell.querySelector('title')).toBeNull();
  });

  it('renders the page inside the body', () => {
    expect(renderShell({}).querySelector('body #page')?.textContent).toBe('page');
  });

  it.each([
    ['unset', {}],
    ['empty', { ethicalAdsPublisher: '' }],
    ['not a string', { ethicalAdsPublisher: 42 }],
  ])('renders no EthicalAds script when the publisher is %s', (_case, extra) => {
    const shell = renderShell(extra);
    expect(shell.querySelector(`script[src="${ETHICAL_ADS_SCRIPT}"]`)).toBeNull();
    expect(shell.documentElement.outerHTML).not.toContain('ethicalads');
  });

  it('renders the EthicalAds script when a publisher is configured', () => {
    const shell = renderShell({ ethicalAdsPublisher: 'syntactical' });
    expect(shell.querySelector(`script[src="${ETHICAL_ADS_SCRIPT}"]`)).not.toBeNull();
  });
});
