import { Text } from 'react-native';
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';
import RootLayout from '../_layout';
import NotFoundScreen from '../+not-found';
import TopicScreen from '../[language]/[difficulty]/index';
import RoundScreen from '../[language]/[difficulty]/play';

jest.mock('../../state/StatsProvider', () => ({
  ...jest.requireActual('../../state/StatsProvider'),
  useQuizStats: () => ({ isHydrated: true, recordAnswer: jest.fn(), recordCompletion: jest.fn(), eventLog: [], stats: { answerStreak: { best: 0, current: 0 } } }),
}));
jest.mock('../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({
    languages: [
      {
        banks: { easy: { hash: 'a'.repeat(64), path: 'python/easy.json', topicCounts: { numbers: 1, strings: 2 } } },
        glyph: 'PY',
        grammar: 'python',
        id: 'python',
        label: 'Python',
        tagline: 't',
        topics: [
          { id: 'strings', label: 'Strings' },
          { id: 'numbers', label: 'Numbers' },
        ],
      },
    ],
    schemaVersion: 2,
  }),
}));
jest.mock('../../state/useQuestionBank', () => {
  const provenance = { isHumanReviewed: false, source: 'original', validation: { method: 'judged', status: 'pending' } };
  const buildBoolQuestion = (id: string, topic: string) => ({
    answer: true,
    id,
    prompt: `Prompt ${id}`,
    provenance,
    query: { explanation: 'e', title: 't' },
    topic,
    type: 'bool',
  });
  const bank = {
    hash: 'a'.repeat(64),
    questions: [buildBoolQuestion('s-1', 'strings'), buildBoolQuestion('s-2', 'strings'), buildBoolQuestion('n-1', 'numbers')],
  };
  return { useQuestionBank: () => ({ bank, status: 'ready' }) };
});

function RoundRouteProbe() {
  return <Text>round route</Text>;
}

describe('routing', () => {
  it('resolves a language id that did not exist at build time', async () => {
    await renderRouter(
      { _layout: RootLayout, '[language]/[difficulty]': RoundRouteProbe, '+not-found': NotFoundScreen },
      { initialUrl: '/elixir/easy' },
    );
    expect(await screen.findByText('round route')).toBeTruthy();
  });

  it('renders the not-found screen with a menu link for an unmatched path', async () => {
    await renderRouter({ _layout: RootLayout, '+not-found': NotFoundScreen }, { initialUrl: '/a/b/c' });
    expect(await screen.findByText('Not found')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to menu' })).toBeTruthy();
  });

  it('shows the topic list at /python/easy', async () => {
    await renderRouter({ '[language]/[difficulty]/index': TopicScreen }, { initialUrl: '/python/easy' });
    expect(await screen.findByRole('button', { name: /Whole bank/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Strings, 2 questions/ })).toBeTruthy();
  });

  it('shows not-found for a difficulty the language has no bank for', async () => {
    await renderRouter({ '[language]/[difficulty]/index': TopicScreen, '+not-found': NotFoundScreen }, { initialUrl: '/python/hard' });
    await waitFor(() => expect(screen.queryByText('Not found')).not.toBeNull());
  });

  it('starts a round of only the topic in /python/easy/play?topic=strings', async () => {
    await renderRouter({ '[language]/[difficulty]/play': RoundScreen }, { initialUrl: '/python/easy/play?topic=strings' });
    expect(await screen.findByText('Q1 / 2')).toBeTruthy();
  });

  it('falls back to the whole bank for a topic the bank has no questions for', async () => {
    await renderRouter({ '[language]/[difficulty]/play': RoundScreen }, { initialUrl: '/python/easy/play?topic=nonsense' });
    expect(await screen.findByText('Q1 / 3')).toBeTruthy();
  });

  it('plays the whole bank at /python/easy/play with no topic', async () => {
    await renderRouter({ '[language]/[difficulty]/play': RoundScreen }, { initialUrl: '/python/easy/play' });
    expect(await screen.findByText('Q1 / 3')).toBeTruthy();
  });
});
