import { act, renderRouter, screen } from 'expo-router/testing-library';
import Constants from 'expo-constants';
import { Text } from 'react-native';
import RootLayout from '../_layout';

const PINNED_BASE_URL = 'https://syntactical.dev/content/';
const UNTRUSTED_WARNING = 'content base URL is missing';

type MutableExtra = { contentBaseUrl?: unknown };

function ProbeScreen() {
  return <Text>probe</Text>;
}

function readExtra(): MutableExtra {
  return (Constants.expoConfig as unknown as { extra: MutableExtra }).extra;
}

async function renderLayoutWithBaseUrl(contentBaseUrl: unknown) {
  readExtra().contentBaseUrl = contentBaseUrl;
  await renderRouter({ _layout: RootLayout, index: ProbeScreen }, { initialUrl: '/' });
  await screen.findByText('probe');
  await act(async () => {});
}

function countUntrustedWarnings(warnSpy: jest.SpyInstance): number {
  return warnSpy.mock.calls.filter(([message]) => String(message).includes(UNTRUSTED_WARNING)).length;
}

function readRequestedUrls(): string[] {
  return (global.fetch as jest.Mock).mock.calls.map(([url]) => String(url));
}

describe('root layout content base URL gate', () => {
  let originalBaseUrl: unknown;

  beforeEach(() => {
    originalBaseUrl = readExtra().contentBaseUrl;
  });

  afterEach(() => {
    readExtra().contentBaseUrl = originalBaseUrl;
  });

  it.each([
    ['undefined', undefined],
    ['an empty string', ''],
  ])('makes no content request and warns once for %s', async (_label, contentBaseUrl) => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await renderLayoutWithBaseUrl(contentBaseUrl);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(countUntrustedWarnings(warnSpy)).toBe(1);
  });

  it('requests the manifest when the base URL is set', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await renderLayoutWithBaseUrl(PINNED_BASE_URL);
    expect(readRequestedUrls()).toContain(`${PINNED_BASE_URL}manifest.json`);
    expect(countUntrustedWarnings(warnSpy)).toBe(0);
  });
});
