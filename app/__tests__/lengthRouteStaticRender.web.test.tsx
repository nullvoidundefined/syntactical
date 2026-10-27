// app/__tests__/lengthRouteStaticRender.web.test.tsx
// The static export renders the length route at build time without its query, so ?topic is absent there. Until
// ContentProvider has read the on-device cache the route renders the loading state whatever its query, so the first
// client render of /python/easy/length?topic=strings matches the build-time HTML; once the cache is read it offers
// the lengths of the topic's pool.
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import { createQueryClient } from '../../config/queryClient';
import { ContentProvider } from '../../state/ContentProvider';
import LengthScreen from '../[language]/[difficulty]/length';

let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useLocalSearchParams: () => mockParams,
}));
// Pools: strings 30, numbers 15, other 55, so the whole bank holds 100.
jest.mock('../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({
    languages: [
      {
        banks: {
          easy: {
            hash: 'a'.repeat(64),
            path: 'python/easy.json',
            topicCounts: { numbers: 15, other: 55, strings: 30 },
          },
        },
        glyph: 'PY',
        grammar: 'python',
        id: 'python',
        label: 'Python',
        tagline: 't',
        topics: [
          { id: 'strings', label: 'Strings' },
          { id: 'numbers', label: 'Numbers' },
          { id: 'other', label: 'Other' },
        ],
      },
    ],
    schemaVersion: 2,
  }),
}));
jest.mock('../../state/useQuestionBank', () => ({ useQuestionBank: () => ({ status: 'loading' }) }));

function buildTree() {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <ContentProvider contentBaseUrl={null}>
        <LengthScreen />
      </ContentProvider>
    </QueryClientProvider>
  );
}

describe('length route in the static export', () => {
  it('renders the loading state in the server render', () => {
    mockParams = { difficulty: 'easy', language: 'python' };
    const html = renderToString(buildTree());
    expect(html).toContain('role="progressbar"');
    expect(html).not.toContain('Select length');
  });

  it('renders the same markup for ?topic=strings as for the build-time page with no query, before the cache read', () => {
    mockParams = { difficulty: 'easy', language: 'python' };
    const staticHtml = renderToString(buildTree());
    mockParams = { difficulty: 'easy', language: 'python', topic: 'strings' };
    expect(renderToString(buildTree())).toBe(staticHtml);
  });

  it("offers the topic pool's lengths once the cache is read", async () => {
    mockParams = { difficulty: 'easy', language: 'python', topic: 'strings' };
    render(buildTree());
    await waitFor(() => expect(screen.getByRole('button', { name: /^All 30 questions/ })).toBeTruthy());
    expect(screen.queryByRole('button', { name: /^50 questions/ })).toBeNull();
  });
});
