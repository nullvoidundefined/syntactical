import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import TopicScreen from '../[language]/[difficulty]/index';
import LengthScreen from '../[language]/[difficulty]/length';
import RoundScreen from '../[language]/[difficulty]/play';

// The manifest on main lists no topic counts; the bank itself holds 30 questions.
jest.mock('../../state/StatsProvider', () => ({
  useQuizStats: () => ({ eventLog: [], isHydrated: true, recordAnswer: jest.fn(), recordCompletion: jest.fn() }),
}));
jest.mock('../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({
    languages: [
      {
        banks: { easy: { hash: 'a'.repeat(64), path: 'python/easy.json', topicCounts: {} } },
        glyph: 'PY',
        grammar: 'python',
        id: 'python',
        label: 'Python',
        tagline: 't',
        topics: [{ id: 'strings', label: 'Strings' }],
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
  const questions = Array.from({ length: 30 }, (_, index) => ({
    answer: true,
    id: `q-${index}`,
    prompt: `Prompt ${index}`,
    provenance,
    query: { explanation: 'e', title: 't' },
    topic: 'strings',
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

describe('the length step when the manifest has no question counts', () => {
  it('shows 20, 50, and All questions (no count) after the whole bank', async () => {
    await renderRouter(routes, { initialUrl: '/python/easy' });
    await fireEvent.press(await screen.findByRole('button', { name: /Whole bank/ }));
    expect(await screen.findByRole('heading', { name: /Select length/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /20 questions/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /50 questions/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^All questions/ })).toBeTruthy();
  });

  it('choosing 50 on a 30-question bank plays all 30', async () => {
    await renderRouter(routes, { initialUrl: '/python/easy/length' });
    await fireEvent.press(await screen.findByRole('button', { name: /50 questions/ }));
    expect(await screen.findByText('Q1 / 30')).toBeTruthy();
  });

  it('choosing 20 plays 20, and All questions plays all 30', async () => {
    await renderRouter(routes, { initialUrl: '/python/easy/length' });
    await fireEvent.press(await screen.findByRole('button', { name: /20 questions/ }));
    expect(await screen.findByText('Q1 / 20')).toBeTruthy();
  });

  it('All questions plays all 30', async () => {
    await renderRouter(routes, { initialUrl: '/python/easy/length' });
    await fireEvent.press(await screen.findByRole('button', { name: /^All questions/ }));
    expect(await screen.findByText('Q1 / 30')).toBeTruthy();
  });
});
