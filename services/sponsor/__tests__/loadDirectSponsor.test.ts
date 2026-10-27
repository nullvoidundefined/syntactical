// services/sponsor/__tests__/loadDirectSponsor.test.ts
// The direct sponsor is fetched from sponsor.json under the content base URL and cached without a hash. It
// shows only between its start and end dates, inclusive (Review Focus 22: an expired sponsor shows the
// house card); a missing file clears the cache, a malformed one reads as none, and a network failure falls
// back to the cached copy.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { CONTENT_CACHE_KEYS } from '../../../constants/contentCacheKeys';
import { CONTENT_BASE_URL, stubFetchRoutes } from '../../content/__tests__/fixtures/contentFixtures';
import { loadDirectSponsor } from '../loadDirectSponsor';

const SPONSOR_URL = `${CONTENT_BASE_URL}sponsor.json`;
const SPONSOR = {
  body: 'Managed Postgres with branching for every pull request.',
  endsOn: '2026-11-30',
  headline: 'Neon',
  href: 'https://neon.tech',
  iconPath: 'sponsor/neon.png',
  startsOn: '2026-11-01',
};
const EXPECTED = {
  body: SPONSOR.body,
  callToAction: 'Learn more',
  headline: 'Neon',
  href: 'https://neon.tech',
  iconUri: `${CONTENT_BASE_URL}sponsor/neon.png`,
  source: 'direct',
};

function serveSponsor(body: unknown) {
  return stubFetchRoutes({
    [SPONSOR_URL]: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  });
}

function serveStatus(status: number) {
  global.fetch = jest.fn((url: unknown) =>
    Promise.resolve({
      headers: { get: () => null },
      ok: false,
      redirected: false,
      status,
      text: () => Promise.resolve(''),
      url: String(url),
    }),
  ) as unknown as typeof fetch;
}

function failNetwork() {
  global.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch;
}

let warn: jest.SpyInstance;

beforeEach(async () => {
  await AsyncStorage.clear();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => warn.mockRestore());

describe('loadDirectSponsor', () => {
  it('returns the sponsor as card content within its dates, and caches it', async () => {
    serveSponsor(SPONSOR);
    expect(await loadDirectSponsor(CONTENT_BASE_URL, '2026-11-15')).toEqual(EXPECTED);
    expect(JSON.parse((await AsyncStorage.getItem(CONTENT_CACHE_KEYS.sponsor)) ?? 'null')).toEqual(SPONSOR);
  });

  it('includes the first and the last day', async () => {
    serveSponsor(SPONSOR);
    expect(await loadDirectSponsor(CONTENT_BASE_URL, '2026-11-01')).toEqual(EXPECTED);
    expect(await loadDirectSponsor(CONTENT_BASE_URL, '2026-11-30')).toEqual(EXPECTED);
  });

  it.each([
    ['the day after it ended', '2026-12-01'],
    ['the day before it starts', '2026-10-31'],
  ])('returns null on %s', async (_name, today) => {
    serveSponsor(SPONSOR);
    expect(await loadDirectSponsor(CONTENT_BASE_URL, today)).toBeNull();
  });

  it('leaves out the icon when the sponsor has none', async () => {
    const { iconPath: _icon, ...withoutIcon } = SPONSOR;
    serveSponsor(withoutIcon);
    const { iconUri: _uri, ...expected } = EXPECTED;
    expect(await loadDirectSponsor(CONTENT_BASE_URL, '2026-11-15')).toEqual(expected);
  });

  it.each([
    ['text that is not JSON', '{ headline'],
    ['a sponsor with an http link', { ...SPONSOR, href: 'http://neon.tech' }],
  ])('returns null for %s', async (_name, body) => {
    serveSponsor(body);
    expect(await loadDirectSponsor(CONTENT_BASE_URL, '2026-11-15')).toBeNull();
  });

  it('returns null and clears the cache when the file is gone', async () => {
    await AsyncStorage.setItem(CONTENT_CACHE_KEYS.sponsor, JSON.stringify(SPONSOR));
    serveStatus(404);
    expect(await loadDirectSponsor(CONTENT_BASE_URL, '2026-11-15')).toBeNull();
    expect(await AsyncStorage.getItem(CONTENT_CACHE_KEYS.sponsor)).toBeNull();
  });

  it('falls back to the cached sponsor offline, still within its dates', async () => {
    await AsyncStorage.setItem(CONTENT_CACHE_KEYS.sponsor, JSON.stringify(SPONSOR));
    failNetwork();
    expect(await loadDirectSponsor(CONTENT_BASE_URL, '2026-11-15')).toEqual(EXPECTED);
    expect(await loadDirectSponsor(CONTENT_BASE_URL, '2026-12-01')).toBeNull();
  });

  it('returns null offline with nothing cached, and with no content base URL makes no request', async () => {
    failNetwork();
    expect(await loadDirectSponsor(CONTENT_BASE_URL, '2026-11-15')).toBeNull();
    const fetchMock = serveSponsor(SPONSOR);
    expect(await loadDirectSponsor(null, '2026-11-15')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
