import { render, screen } from '@testing-library/react-native';

import type { Stats } from '../../../services/stats/types/Stats';
import { StatsPanel } from '../StatsPanel';

const playedStats = {
  answerStreak: { best: 7, current: 2 },
  goalHistory: [],
  isSignUpPromptDismissed: false,
  totals: { attempted: 4, correct: 3 },
  tracks: {
    'cobol:hard': { attempted: 2, completions: 0, correct: 2 },
    'python:easy': { attempted: 4, completions: 1, correct: 3 },
  },
  version: 2,
};
const emptyStats = {
  ...playedStats,
  answerStreak: { best: 0, current: 0 },
  totals: { attempted: 0, correct: 0 },
  tracks: {},
};
let mockStats: Stats = playedStats;
let mockEventLog: unknown[] = [];
jest.mock('../../../state/StatsProvider', () => ({
  useQuizStats: () => ({ eventLog: mockEventLog, stats: mockStats }),
}));
jest.mock('../WeaknessReport', () => ({ WeaknessReport: () => null }));
jest.mock('../../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({
    languages: [{ banks: {}, glyph: 'PY', grammar: 'python', id: 'python', label: 'Python', tagline: 't' }],
    schemaVersion: 2,
  }),
}));

const downloadedEvent = { eventId: 'e1', isCorrect: true, isHeld: false, isSynced: true, ownerUserId: 'user-1' };

describe('StatsPanel', () => {
  beforeEach(() => {
    mockStats = playedStats;
    mockEventLog = [];
  });

  it('renders nothing before the owner has answered a question', async () => {
    mockStats = emptyStats;
    await render(<StatsPanel />);
    expect(screen.queryByText('Answer streak')).toBeNull();
    expect(screen.queryByText('Lifetime accuracy')).toBeNull();
    expect(screen.queryByText('none yet')).toBeNull();
    expect(screen.toJSON()).toBeNull();
  });

  it('shows the stats once downloaded history exists for a signed-in owner with no local answers', async () => {
    mockStats = emptyStats;
    mockEventLog = [downloadedEvent];
    await render(<StatsPanel />);
    expect(screen.getByText('Answer streak')).toBeTruthy();
    expect(screen.getByText('Lifetime accuracy')).toBeTruthy();
  });

  it('shows lifetime accuracy and a per-language, per-difficulty breakdown', async () => {
    await render(<StatsPanel />);
    expect(screen.getAllByText('75%')).toHaveLength(2);
    expect(screen.getByText('PY / Easy')).toBeTruthy();
  });

  it('keeps the answer streak, current and best, in the stats panel', async () => {
    await render(<StatsPanel />);
    expect(screen.getByText('Answer streak')).toBeTruthy();
    expect(screen.getByText('2 (best 7)')).toBeTruthy();
  });

  it('omits stats for a language no longer in the manifest', async () => {
    await render(<StatsPanel />);
    expect(screen.queryByText(/cobol/i)).toBeNull();
    expect(screen.queryByText('100%')).toBeNull();
  });
});
