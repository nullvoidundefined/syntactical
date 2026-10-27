// app/__tests__/roundRouteStaticRender.web.test.tsx
// Review Focus 16: the static export renders the round route in Node at build time, with no query (count, topic) and,
// for any render that runs before the router has params, with no route params at all. That render, and every client
// render until ContentProvider has read the on-device cache, shows the loading state: never the not-found screen,
// never a round built from missing params, and never a round started on the bundled bank before the cached one is
// known. Once the cache is read the round plays.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import { createQueryClient } from '../../config/queryClient';
import { settle } from '../../config/settle';
import { ContentProvider } from '../../state/ContentProvider';
import RoundScreen from '../[language]/[difficulty]/play';

let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useLocalSearchParams: () => mockParams,
}));
// A plain stand-in, so the assertion reads the screen's text without needing a navigator for its Link. A require
// inside a mock factory is not rewritten to react-native-web, so it names react-native-web itself.
jest.mock('../+not-found', () => ({
  __esModule: true,
  default: () => require('react').createElement(require('react-native-web').Text, null, 'Not found'),
}));
jest.mock('../../state/useCanAsk', () => ({ useCanAsk: () => false }));
jest.mock('../../state/StatsProvider', () => ({
  useQuizStats: () => ({ eventLog: [], isHydrated: true, recordAnswer: jest.fn(), recordCompletion: jest.fn() }),
}));
jest.mock('../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({
    languages: [
      {
        banks: { easy: { hash: 'a'.repeat(64), path: 'python/easy.json' } },
        glyph: 'PY',
        grammar: 'python',
        id: 'python',
        label: 'Python',
        tagline: 't',
      },
    ],
    schemaVersion: 2,
  }),
}));
jest.mock('../../state/useQuestionBank', () => ({
  useQuestionBank: () => ({
    bank: {
      hash: 'a'.repeat(64),
      questions: [
        {
          answer: true,
          id: 'q-1',
          prompt: 'Is it?',
          provenance: {
            isHumanReviewed: false,
            source: 'original',
            validation: { method: 'judged', status: 'pending' },
          },
          query: { explanation: 'e', title: 't' },
          type: 'bool',
        },
      ],
    },
    status: 'ready',
  }),
}));
// Reanimated reads window.matchMedia when it loads, which jsdom lacks; the round needs only the reduced-motion hook.
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
// The sign-up prompt reads auth and stats; SignUpPrompt.test.tsx covers it.
jest.mock('../../components/auth/SignUpPrompt', () => ({ SignUpPrompt: () => null }));

// The real ContentProvider: its isHydrated is false in a server render (effects never run) and turns true once the
// AsyncStorage read finishes in the browser.
function buildTree() {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <ContentProvider contentBaseUrl={null}>
        <RoundScreen />
      </ContentProvider>
    </QueryClientProvider>
  );
}

// Holds every AsyncStorage read until release(), so a test can look at the route before the cache read resolves.
function holdStorageReads() {
  let openGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });
  const realGetItem = jest.mocked(AsyncStorage.getItem).getMockImplementation();
  const spy = jest.spyOn(AsyncStorage, 'getItem').mockImplementation(async (key: string) => {
    await gate;
    return realGetItem?.(key) ?? null;
  });
  return {
    release: () => act(async () => openGate()),
    restore: () => spy.mockImplementation(realGetItem),
  };
}

describe('round route in the static export', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders the loading state, not the not-found screen, with empty params in the server render', () => {
    mockParams = {};
    const html = renderToString(buildTree());
    expect(html).not.toContain('Not found');
    expect(html).toContain('role="progressbar"');
  });

  it('renders the loading state, not a round, in the server render of a generated page', () => {
    mockParams = { difficulty: 'easy', language: 'python' };
    const html = renderToString(buildTree());
    expect(html).not.toContain('Q1 / 1');
    expect(html).toContain('role="progressbar"');
  });

  it('renders the loading state, not a round from the bundled bank, while the cache read is pending', async () => {
    mockParams = { count: '20', difficulty: 'easy', language: 'python' };
    const storage = holdStorageReads();
    try {
      render(buildTree());
      await settle();
      expect(screen.queryByText('Q1 / 1')).toBeNull();
      expect(screen.getByRole('progressbar')).toBeTruthy();
      await storage.release();
    } finally {
      storage.restore();
    }
  });

  it('plays the bank once the cache is read in the browser', async () => {
    mockParams = { difficulty: 'easy', language: 'python' };
    render(buildTree());
    await waitFor(() => expect(screen.queryByText('Q1 / 1')).not.toBeNull());
  });

  it('still shows the not-found screen once the cache is read for a language the manifest does not list', async () => {
    mockParams = { difficulty: 'easy', language: 'cobol' };
    render(buildTree());
    await waitFor(() => expect(screen.queryByText('Not found')).not.toBeNull());
  });
});
