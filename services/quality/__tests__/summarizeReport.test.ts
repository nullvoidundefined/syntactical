import { summarizeBanks } from '../summarizeBanks';
import { summarizeReport } from '../summarizeReport';
import type { PipelineReportInput } from '../types/PipelineReportInput';

const REPORT: PipelineReportInput = {
  agreement: { classify: 0.75 },
  finishedAt: '2026-10-02T10:00:00Z',
  questions: [
    { bankKey: 'python/easy', id: 'p1', runtimeVersion: 'Python 3.13.2', status: 'passed' },
    { bankKey: 'python/easy', id: 'p2', reason: 'answer-mismatch', status: 'failed' },
    { bankKey: 'python/easy', id: 'p3', reason: 'answer-mismatch', status: 'failed' },
    { bankKey: 'python/hard', id: 'p4', reason: 'ambiguous', status: 'failed' },
    { bankKey: 'postgres/easy', id: 'q1', status: 'not-executable' },
    { bankKey: 'postgres/easy', id: 'q2', runtimeVersion: 'PostgreSQL 17', status: 'passed' },
  ],
  runId: 'run-1',
};

describe('summarizeReport', () => {
  it('summarizes counts, failures, reasons, method mix, agreement, and the human review rate', () => {
    expect(summarizeReport(REPORT)).toEqual({
      agreement: { classify: 0.75 },
      audited: 6,
      auditFailuresInOriginal: 3,
      humanReviewRate: 1 / 6,
      methodMix: { executed: 5, judged: 1 },
      rejectedByReason: { ambiguous: 1, 'answer-mismatch': 2 },
    });
  });

  it('does not count passed or not-executable questions as audit failures', () => {
    const { auditFailuresInOriginal, rejectedByReason } = summarizeReport({
      ...REPORT,
      questions: [
        { bankKey: 'a/b', id: '1', status: 'passed' },
        { bankKey: 'a/b', id: '2', status: 'not-executable' },
      ],
    });
    expect(auditFailuresInOriginal).toBe(0);
    expect(rejectedByReason).toEqual({});
  });

  it('counts only not-executable questions toward the human review rate, never failed ones', () => {
    const questions = [
      { bankKey: 'a/b', id: '1', reason: 'ambiguous', status: 'failed' },
      { bankKey: 'a/b', id: '2', reason: 'ambiguous', status: 'failed' },
      { bankKey: 'a/b', id: '3', status: 'not-executable' },
      { bankKey: 'a/b', id: '4', status: 'passed' },
    ];
    expect(summarizeReport({ ...REPORT, questions }).humanReviewRate).toBe(1 / 4);
    expect(summarizeReport({ ...REPORT, questions: questions.slice(0, 2) }).humanReviewRate).toBe(0);
  });

  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])('counts a reason named %s as plain data', (reason) => {
    const { rejectedByReason } = summarizeReport({ ...REPORT, questions: [{ bankKey: 'a/b', id: '1', reason, status: 'failed' }] });
    expect(Object.keys(rejectedByReason)).toEqual([reason]);
    expect(Object.getOwnPropertyDescriptor(rejectedByReason, reason)?.value).toBe(1);
    expect(JSON.parse(JSON.stringify(rejectedByReason))).toEqual(JSON.parse(`{"${reason}":1}`));
  });

  it('files a failure with no recorded reason under unspecified', () => {
    const { rejectedByReason } = summarizeReport({ ...REPORT, questions: [{ bankKey: 'a/b', id: '1', status: 'failed' }] });
    expect(rejectedByReason).toEqual({ unspecified: 1 });
  });

  it('reports a zero human review rate and empty maps for a report with no questions and no agreement', () => {
    expect(summarizeReport({ finishedAt: 'x', questions: [], runId: 'r' })).toEqual({
      agreement: {},
      audited: 0,
      auditFailuresInOriginal: 0,
      humanReviewRate: 0,
      methodMix: {},
      rejectedByReason: {},
    });
  });
});

describe('summarizeBanks', () => {
  it('counts each verdict per bank, sorted by bank key', () => {
    expect(summarizeBanks(REPORT)).toEqual([
      { audited: 2, bankKey: 'postgres/easy', failed: 0, notExecutable: 1, passed: 1 },
      { audited: 3, bankKey: 'python/easy', failed: 2, notExecutable: 0, passed: 1 },
      { audited: 1, bankKey: 'python/hard', failed: 1, notExecutable: 0, passed: 0 },
    ]);
  });
});
