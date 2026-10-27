// components/seo/__tests__/PageHead.web.test.tsx
// PageHead puts a page's title, its description, and its canonical URL on https://syntactical.dev into the document
// head through Expo Router's Head. Head itself needs the provider Expo Router's root mounts, so it is replaced here by
// a pass-through: this suite checks what PageHead asks Head to write, and the built pages (Tasks 5.8 and 7.2) check
// that Head writes it.
import { render } from '@testing-library/react';

import { PageHead, SITE_ORIGIN } from '../PageHead';

jest.mock('expo-router/head', () => ({
  __esModule: true,
  default: ({ children }: { children: unknown }) => require('react').createElement('div', null, children),
}));

describe('PageHead on the web', () => {
  it('writes the title alone when that is all it is given', () => {
    render(<PageHead title="Syntactical" />);
    expect(document.querySelector('title')?.textContent).toBe('Syntactical');
    expect(document.querySelector('meta[name="description"]')).toBeNull();
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('writes the description and the canonical URL on the site origin', () => {
    render(<PageHead canonicalPath="/go/" description="Go quiz banks." title="Go quiz | Syntactical" />);
    expect(SITE_ORIGIN).toBe('https://syntactical.dev');
    expect(document.querySelector('title')?.textContent).toBe('Go quiz | Syntactical');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Go quiz banks.');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://syntactical.dev/go/');
  });
});
