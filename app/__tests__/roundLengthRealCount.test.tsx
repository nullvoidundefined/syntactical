import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import TopicScreen from '../[language]/[difficulty]/index';
import LengthScreen from '../[language]/[difficulty]/length';
import RoundScreen from '../[language]/[difficulty]/play';

// The manifest counts drift from the loaded bank: "strings" is listed as 100 but the bank holds 15,
// and "numbers" is listed as 15 but the bank holds 30. The screens must follow the bank.
jest.mock('../../state/useCanAsk', () => ({ useCanAsk: () => false }));
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
            topicCounts: { numbers: 15, strings: 100 },
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
    ...Array.from({ length: 15 }, (_, index) => ['strings', index]),
    ...Array.from({ length: 30 }, (_, index) => ['numbers', index]),
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

describe('the menu follows the loaded bank when the manifest count differs', () => {
  it('topic step: a topic listed as 100 but holding 15 goes straight to play', async () => {
    await renderRouter(routes, { initialUrl: '/python/easy' });
    await fireEvent.press(await screen.findByRole('button', { name: /^Strings/ }));
    expect(await screen.findByText('Q1 / 15')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Select length/ })).toBeNull();
  });

  it('topic step: a topic listed as 15 but holding 30 opens the length step', async () => {
    await renderRouter(routes, { initialUrl: '/python/easy' });
    await fireEvent.press(await screen.findByRole('button', { name: /^Numbers/ }));
    expect(await screen.findByRole('heading', { name: /Select length/ })).toBeTruthy();
  });

  it('length step: a deep link for a topic listed as 100 but holding 15 redirects to play', async () => {
    await renderRouter(routes, { initialUrl: '/python/easy/length?topic=strings' });
    expect(await screen.findByText('Q1 / 15')).toBeTruthy();
  });

  it('length step: a topic listed as 15 but holding 30 shows "All 30"', async () => {
    await renderRouter(routes, { initialUrl: '/python/easy/length?topic=numbers' });
    expect(await screen.findByRole('button', { name: /All 30 questions/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /All 15 questions/ })).toBeNull();
  });
});
