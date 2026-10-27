// app/__tests__/staticRouteParams.test.ts
// The static web export writes a page for a dynamic route only for the params its generateStaticParams returns: every
// track in the bundled manifest for app/[language], and every track and difficulty pair the manifest has a bank for
// in the three app/[language]/[difficulty] routes.
import { BUNDLED_MANIFEST } from '../../services/content/bundledManifest.generated';
import * as TopicRoute from '../[language]/[difficulty]/index';
import * as LengthRoute from '../[language]/[difficulty]/length';
import * as RoundRoute from '../[language]/[difficulty]/play';
import * as DifficultyRoute from '../[language]/index';

// The shipped catalogue: 12 tracks, each with an easy, a medium, and a hard bank. Update with the catalogue.
const TRACK_COUNT = 12;
const BANK_COUNT = 36;

function hasBank(language: string, difficulty: string): boolean {
  const entry = BUNDLED_MANIFEST.languages.find(({ id }) => id === language);
  return entry !== undefined && Object.hasOwn(entry.banks, difficulty);
}

describe('generateStaticParams', () => {
  it('lists every track in the bundled manifest once, in manifest order, for app/[language]', () => {
    const params = DifficultyRoute.generateStaticParams();
    expect(params).toHaveLength(TRACK_COUNT);
    expect(params.map(({ language }) => language)).toEqual(BUNDLED_MANIFEST.languages.map(({ id }) => id));
  });

  it.each([
    ['app/[language]/[difficulty]/index', TopicRoute],
    ['app/[language]/[difficulty]/length', LengthRoute],
    ['app/[language]/[difficulty]/play', RoundRoute],
  ])('lists every track and difficulty pair with a bank, once each, for %s', (_route, routeModule) => {
    const params = routeModule.generateStaticParams();
    expect(params).toHaveLength(BANK_COUNT);
    expect(new Set(params.map(({ difficulty, language }) => `${language}/${difficulty}`)).size).toBe(BANK_COUNT);
    expect(params.filter(({ difficulty, language }) => !hasBank(language, difficulty))).toEqual([]);
  });
});
