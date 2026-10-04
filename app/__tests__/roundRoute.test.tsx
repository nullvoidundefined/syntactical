import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import RoundScreen from '../[language]/[difficulty]/play';

jest.mock('../../state/StatsProvider', () => ({
  useQuizStats: () => ({ isHydrated: true, recordAnswer: jest.fn(), recordCompletion: jest.fn() }),
}));
jest.mock('../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({
    languages: [{ banks: { easy: { hash: 'a'.repeat(64), path: 'python/easy.json' } }, glyph: 'PY', grammar: 'python', id: 'python', label: 'Python', tagline: 't' }],
    schemaVersion: 2,
  }),
}));
jest.mock('../../state/useQuestionBank', () => ({
  useQuestionBank: () => ({
    bank: { hash: 'a'.repeat(64), questions: [{ answer: true, id: 'q-1', prompt: 'Is it?', query: { explanation: 'e', title: 't' }, provenance: { isHumanReviewed: false, source: 'original', validation: { method: 'judged', status: 'pending' } }, type: 'bool' }] },
    status: 'ready',
  }),
}));

// The sign-up prompt reads auth and stats; SignUpPrompt.test.tsx covers it.
jest.mock('../../components/auth/SignUpPrompt', () => ({ SignUpPrompt: () => null }));

describe('round route', () => {
  it('resets every piece of round state on Retry', async () => {
    await renderRouter({ '[language]/[difficulty]/play': RoundScreen }, { initialUrl: '/python/easy/play' });
    await waitFor(() => expect(screen.queryByText('True')).not.toBeNull());
    await fireEvent.press(screen.getByText('True'));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.queryByText('Q1 / 1')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });

  it('renders the not-found screen for a difficulty outside the registry', async () => {
    await renderRouter({ '[language]/[difficulty]/play': RoundScreen }, { initialUrl: '/python/expert/play' });
    await waitFor(() => expect(screen.queryByText('Not found')).not.toBeNull());
  });
});
