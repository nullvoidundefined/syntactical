import { render, screen } from '@testing-library/react-native';

import { StatsPanel } from '../StatsPanel';

jest.mock('../../../state/StatsProvider', () => ({
  useQuizStats: () => ({
    eventLog: [],
    stats: {
      answerStreak: { best: 0, current: 0 },
      goalHistory: [],
      isSignUpPromptDismissed: false,
      totals: { attempted: 4, correct: 3 },
      tracks: {
        'cobol:hard': { attempted: 2, completions: 0, correct: 2 },
        'python:easy': { attempted: 4, completions: 1, correct: 3 },
      },
      version: 2,
    },
  }),
}));
jest.mock('../WeaknessReport', () => ({ WeaknessReport: () => null }));
jest.mock('../../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({
    languages: [{ banks: {}, glyph: 'PY', grammar: 'python', id: 'python', label: 'Python', tagline: 't' }],
    schemaVersion: 2,
  }),
}));

describe('StatsPanel', () => {
  it('shows lifetime accuracy and a per-language, per-difficulty breakdown', async () => {
    await render(<StatsPanel />);
    expect(screen.getAllByText('75%')).toHaveLength(2);
    expect(screen.getByText('PY / Easy')).toBeTruthy();
  });

  it('omits stats for a language no longer in the manifest', async () => {
    await render(<StatsPanel />);
    expect(screen.queryByText(/cobol/i)).toBeNull();
    expect(screen.queryByText('100%')).toBeNull();
  });
});
