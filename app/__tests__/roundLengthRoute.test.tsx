import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import LengthScreen from '../[language]/[difficulty]/length';
import TopicScreen from '../[language]/[difficulty]/index';
import RoundScreen from '../[language]/[difficulty]/play';

// Pools: strings 30, numbers 15, other 55, so the whole bank holds 100.
jest.mock('../../state/StatsProvider', () => ({
  useQuizStats: () => ({ eventLog: [], isHydrated: true, recordAnswer: jest.fn(), recordCompletion: jest.fn() }),
}));
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
jest.mock('../../state/useQuestionBank', () => {
  const provenance = {
    isHumanReviewed: false,
    source: 'original',
    validation: { method: 'judged', status: 'pending' },
  };
  const questions = [
    ...Array.from({ length: 30 }, (_, index) => ['strings', index]),
    ...Array.from({ length: 15 }, (_, index) => ['numbers', index]),
    ...Array.from({ length: 55 }, (_, index) => ['other', index]),
  ].map(([topic, index]) => ({
    answer: true,
    id: `${topic}-${index}`,
    prompt: `Prompt ${topic}-${index}`,
    provenance,
    query: { explanation: 'e', title: 't' },
    topic,
    type: 'bool',
  }));
  const bank = { hash: 'a'.repeat(64), questions };
  return { useQuestionBank: () => ({ bank, status: 'ready' }) };
});
jest.mock('../../components/auth/SignUpPrompt', () => ({ SignUpPrompt: () => null }));

const routes = {
  '[language]/[difficulty]/index': TopicScreen,
  '[language]/[difficulty]/length': LengthScreen,
  '[language]/[difficulty]/play': RoundScreen,
};

describe('the length step in the menu flow', () => {
  it('plays 20 of the whole bank (100 questions) straight from the topic step', async () => {
    await renderRouter(routes, { initialUrl: '/python/easy' });
    expect(await screen.findByRole('button', { name: /^50 questions/ })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^20 questions/ }));
    expect(await screen.findByText('Q1 / 20')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Select length/ })).toBeNull();
  });

  it('plays 50 of the whole bank when 50 is chosen', async () => {
    await renderRouter(routes, { initialUrl: '/python/easy' });
    await fireEvent.press(await screen.findByRole('button', { name: /^50 questions/ }));
    expect(await screen.findByText('Q1 / 50')).toBeTruthy();
  });

  it('plays all 100 when All is chosen', async () => {
    await renderRouter(routes, { initialUrl: '/python/easy' });
    await fireEvent.press(await screen.findByRole('button', { name: /^All 100 questions/ }));
    expect(await screen.findByText('Q1 / 100')).toBeTruthy();
  });

  it('keeps the chosen topic with the count: a topic of 30 offers 20 and all, and plays 20 of the topic', async () => {
    await renderRouter(routes, { initialUrl: '/python/easy' });
    await fireEvent.press(await screen.findByRole('button', { name: /Strings, 30 questions/ }));
    expect(await screen.findByRole('heading', { name: /Select length/ })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /All 30 questions/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /50 questions/ })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /20 questions/ }));
    expect(await screen.findByText('Q1 / 20')).toBeTruthy();
    expect(screen.getByText(/^Prompt strings-/)).toBeTruthy();
  });

  it('skips the length step for a topic of 15 and plays all of it', async () => {
    await renderRouter(routes, { initialUrl: '/python/easy' });
    await fireEvent.press(await screen.findByRole('button', { name: /Numbers, 15 questions/ }));
    expect(await screen.findByText('Q1 / 15')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Select length/ })).toBeNull();
  });

  it('sends a deep link to the length step of a small pool straight to the round', async () => {
    await renderRouter(routes, { initialUrl: '/python/easy/length?topic=numbers' });
    expect(await screen.findByText('Q1 / 15')).toBeTruthy();
  });

  it('Back on the length step returns to the topic step', async () => {
    await renderRouter(routes, { initialUrl: '/python/easy/length' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: /Select topic/ })).toBeTruthy();
  });
});

describe('the round route with a count', () => {
  it.each([
    ['?count=20', 'Q1 / 20'],
    ['?count=50', 'Q1 / 50'],
    ['?count=20&topic=strings', 'Q1 / 20'],
    ['?topic=strings&count=50', 'Q1 / 30'],
    ['', 'Q1 / 100'],
    ['?count=0', 'Q1 / 100'],
    ['?count=-20', 'Q1 / 100'],
    ['?count=abc', 'Q1 / 100'],
    ['?count=', 'Q1 / 100'],
    ['?count=30', 'Q1 / 100'],
    ['?count=100', 'Q1 / 100'],
    ['?count=500', 'Q1 / 100'],
    ['?count=20&count=50', 'Q1 / 100'],
    ['?count=20&topic=numbers', 'Q1 / 15'],
  ])('plays the expected length for %s', async (query, expected) => {
    await renderRouter(routes, { initialUrl: `/python/easy/play${query}` });
    expect(await screen.findByText(expected)).toBeTruthy();
  });

  it('draws a new sample on Retry when the random source changes', async () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      await renderRouter(routes, { initialUrl: '/python/easy/play?count=20' });
      await waitFor(() => expect(screen.queryByText('Q1 / 20')).not.toBeNull());
      const firstPrompt = screen.getByText(/^Prompt /).props.children;
      for (let answered = 0; answered < 20; answered += 1) {
        await fireEvent.press(screen.getByText('True'));
        await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
      }
      random.mockReturnValue(0.999);
      await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(screen.queryByText('Q1 / 20')).not.toBeNull());
      expect(screen.getByText(/^Prompt /).props.children).not.toEqual(firstPrompt);
    } finally {
      random.mockRestore();
    }
  });
});
