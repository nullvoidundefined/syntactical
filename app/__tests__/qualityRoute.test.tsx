import { within } from '@testing-library/react-native';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { summarizeBanks } from '../../services/quality/summarizeBanks';
import { summarizeReport } from '../../services/quality/summarizeReport';
import LanguageScreen from '../index';
import QualityScreen from '../quality';

const mockReport = jest.fn();

jest.mock('../../services/quality/qualityReport.generated', () => ({
  get QUALITY_REPORT() {
    return mockReport();
  },
}));
jest.mock('../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({
    languages: [{ banks: {}, glyph: 'PY', grammar: 'python', id: 'python', label: 'Python', tagline: 't' }],
    schemaVersion: 2,
  }),
}));
jest.mock('../../state/StatsProvider', () => ({
  useQuizStats: () => ({ stats: { streak: { best: 0, current: 0 }, totals: { attempted: 0, correct: 0 }, tracks: {}, version: 1 } }),
}));

const REPORT = {
  banks: [
    { audited: 3, bankKey: 'python/easy', failed: 2, notExecutable: 0, passed: 1 },
    { audited: 2, bankKey: 'postgres/easy', failed: 0, notExecutable: 1, passed: 1 },
  ],
  finishedAt: '2026-10-02T10:00:00Z',
  runId: 'run-1',
  summary: {
    agreement: { classify: 0.75 },
    audited: 5,
    auditFailuresInOriginal: 2,
    humanReviewRate: 0.6,
    methodMix: { executed: 4, judged: 1 },
    rejectedByReason: { 'answer-mismatch': 2 },
  },
};

function listLevelOneHeadings(): string[] {
  return screen
    .getAllByRole('heading')
    .filter((heading) => heading.props['aria-level'] === 1)
    .map((heading) => String(heading.props.children));
}

const ROUTES = { index: LanguageScreen, quality: QualityScreen };

describe('quality route', () => {
  it('renders one h1 and a labeled number for every figure in the report', async () => {
    mockReport.mockReturnValue(REPORT);
    await renderRouter(ROUTES, { initialUrl: '/quality' });
    expect(listLevelOneHeadings()).toEqual(['Content quality']);
    for (const label of [
      'Questions audited: 5',
      'Audit failures in the original banks: 2',
      'Share needing human review (not executable): 60%',
      'answer-mismatch: 2',
      'executed: 4',
      'judged: 1',
      'classify: 75%',
      'python/easy: 2 failed',
      'python/easy: 3 audited',
      'postgres/easy: 1 not executable',
      'postgres/easy: 1 passed',
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('says it is not audited yet when no report was bundled, without inventing numbers', async () => {
    mockReport.mockReturnValue(null);
    await renderRouter(ROUTES, { initialUrl: '/quality' });
    expect(screen.getByText('Not audited yet')).toBeTruthy();
    expect(screen.queryByLabelText(/Questions audited/)).toBeNull();
    expect(listLevelOneHeadings()).toEqual(['Content quality']);
  });

  it('is reachable from the Content quality link on the language screen', async () => {
    mockReport.mockReturnValue(null);
    const routerRender = renderRouter(ROUTES, { initialUrl: '/' });
    await routerRender;
    await fireEvent.press(screen.getByRole('link', { name: 'Content quality' }));
    await waitFor(() => expect(routerRender.getPathname()).toBe('/quality'));
    expect(listLevelOneHeadings()).toEqual(['Content quality']);
    expect(screen.getByText('Not audited yet')).toBeTruthy();
  });

  it('renders the output of the real summarizers, with each visible figure equal to its spoken one', async () => {
    const pipelineReport = {
      agreement: { classify: 0.5 },
      counts: { failed: 2, 'not-executable': 1, passed: 1 },
      finishedAt: '2026-10-02T11:00:00Z',
      questions: [
        { bankKey: 'python/easy', id: 'a', status: 'passed' },
        { bankKey: 'python/easy', id: 'b', reason: 'answer-mismatch', status: 'failed' },
        { bankKey: 'python/hard', id: 'c', reason: 'ambiguous', status: 'failed' },
        { bankKey: 'python/hard', id: 'd', status: 'not-executable' },
      ],
      runId: 'run-9',
      stage: 'validate',
      startedAt: '2026-10-02T10:00:00Z',
    };
    mockReport.mockReturnValue({
      banks: summarizeBanks(pipelineReport),
      finishedAt: pipelineReport.finishedAt,
      runId: pipelineReport.runId,
      summary: summarizeReport(pipelineReport),
    });
    await renderRouter(ROUTES, { initialUrl: '/quality' });
    const audited = screen.getByLabelText('Questions audited: 4');
    expect(within(audited).getByText('4', { includeHiddenElements: true })).toBeTruthy();
    const failures = screen.getByLabelText('Audit failures in the original banks: 2');
    expect(within(failures).getByText('2', { includeHiddenElements: true })).toBeTruthy();
    const review = screen.getByLabelText('Share needing human review (not executable): 25%');
    expect(within(review).getByText('25%', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByLabelText('python/hard: 1 not executable')).toBeTruthy();
    expect(screen.getByLabelText('ambiguous: 1')).toBeTruthy();
  });
});
