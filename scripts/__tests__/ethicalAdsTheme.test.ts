// scripts/__tests__/ethicalAdsTheme.test.ts
// EthicalAds text placements take the card's colours: global.css sets the --ea- custom properties from the
// same hex values as the surface, signal, and ink tokens in tailwind.config.js.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const css = readFileSync(join(ROOT, 'global.css'), 'utf8');
const tailwind = readFileSync(join(ROOT, 'tailwind.config.js'), 'utf8');

function readToken(name: string): string {
  const match = new RegExp(`\\b'?${name}'?: '(#[0-9a-f]{6})'`).exec(tailwind);
  if (!match) throw new Error(`token ${name} not found`);
  return match[1];
}

function readProperty(name: string): string | undefined {
  return new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1].trim();
}

describe('EthicalAds theme properties', () => {
  it('uses the surface background, signal links, and ink for bold link text', () => {
    expect(readProperty('--ea-bgcolor')).toBe(readToken('surface'));
    expect(readProperty('--ea-color-link')).toBe(readToken('signal'));
    expect(readProperty('--ea-color-link-bold')).toBe(readToken('ink'));
  });

  it('sets the text size to the app small text (text-sm, 14px)', () => {
    expect(readProperty('--ea-font-size')).toBe('14px');
  });
});
