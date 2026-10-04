import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildContentManifest } from '../buildContentManifest.mjs';

const REPOSITORY_CONTENT_DIR = join(__dirname, '..', '..', 'content');
const LANGUAGE_IDS = ['python', 'postgres', 'javascript'];
const DIFFICULTY_IDS = ['easy', 'medium', 'hard'];

type ReportQuestion = { bankKey: string; id: string; reason?: string; status: string };

function buildReport(skippedBankKey?: string) {
    const questions: ReportQuestion[] = LANGUAGE_IDS.flatMap((language) =>
        DIFFICULTY_IDS.map((difficulty) => `${language}/${difficulty}`),
    )
        .filter((bankKey) => bankKey !== skippedBankKey)
        .flatMap((bankKey) => [
            { bankKey, id: `${bankKey}-1`, status: 'passed' },
            { bankKey, id: `${bankKey}-2`, reason: 'answer-mismatch', status: 'failed' },
        ]);
    return { agreement: { classify: 1 }, counts: {}, finishedAt: 'f', questions, runId: 'run-1', stage: 'validate', startedAt: 's' };
}

describe('buildContentManifest quality report', () => {
    let workDir: string;
    let contentDir: string;
    let generatedPath: string;
    let reportPath: string;
    let qualityPath: string;

    beforeEach(async () => {
        workDir = await mkdtemp(join(tmpdir(), 'content-quality-'));
        contentDir = join(workDir, 'content');
        generatedPath = join(workDir, 'bundledContent.ts');
        reportPath = join(workDir, 'reports', 'latest.json');
        qualityPath = join(workDir, 'quality', 'qualityReport.generated.ts');
        await cp(REPOSITORY_CONTENT_DIR, contentDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(workDir, { recursive: true, force: true });
    });

    async function writeReport(report: unknown): Promise<void> {
        await mkdir(dirname(reportPath), { recursive: true });
        await writeFile(reportPath, JSON.stringify(report));
    }

    function build(): Promise<void> {
        return buildContentManifest(contentDir, generatedPath, { outputPath: qualityPath, reportPath });
    }

    it('throws missing report for python/hard when a published bank has no entry in the report', async () => {
        await writeReport(buildReport('python/hard'));

        await expect(build()).rejects.toThrow('missing report for python/hard');
    });

    it('bundles the summarized report when every published bank is covered', async () => {
        await writeReport(buildReport());

        await build();

        const source = await readFile(qualityPath, 'utf8');
        expect(source).toContain('"audited": 18');
        expect(source).toContain('"auditFailuresInOriginal": 9');
        expect(source).toContain('"bankKey": "python/hard"');
        expect(source).toContain('"runId": "run-1"');
    });

    it('bundles the not-audited-yet state when no report has been committed', async () => {
        await build();

        expect(await readFile(qualityPath, 'utf8')).toContain('QUALITY_REPORT: QualityReport | null = null;');
    });

    it('fails on a report that is not valid JSON instead of treating it as absent', async () => {
        await mkdir(dirname(reportPath), { recursive: true });
        await writeFile(reportPath, '{not json');

        await expect(build()).rejects.toThrow(SyntaxError);
        await expect(build()).rejects.not.toThrow(/missing report/);
    });

    it('names the first published bank as missing when the report has an empty questions list', async () => {
        await writeReport({ ...buildReport(), questions: [] });

        await expect(build()).rejects.toThrow('missing report for python/easy');
    });

    it.each([
        ['a non-string runId', { runId: 7 }, 'pipeline report has no runId string'],
        ['a missing runId', { runId: undefined }, 'pipeline report has no runId string'],
        ['a non-string finishedAt', { finishedAt: 1 }, 'pipeline report has no finishedAt string'],
        ['a missing questions list', { questions: undefined }, 'pipeline report has no questions list'],
        ['a null report', null, 'pipeline report has no runId string'],
    ])('rejects a report with %s', async (_name, override, message) => {
        await writeReport(override === null ? null : { ...buildReport(), ...override });

        await expect(build()).rejects.toThrow(message);
    });

    it.each([
        ['a question with a non-string bankKey', { bankKey: 3, id: 'x', status: 'passed' }, 'no bankKey string'],
        ['a question with an unknown status', { bankKey: 'python/easy', id: 'x', status: 'skipped' }, 'unknown status: skipped'],
        ['a question with no status', { bankKey: 'python/easy', id: 'x' }, 'unknown status: undefined'],
        ['a null question', null, 'no bankKey string'],
    ])('rejects a report with %s', async (_name, question, message) => {
        const report = buildReport();
        await writeReport({ ...report, questions: [...report.questions, question] });

        await expect(build()).rejects.toThrow(message);
    });

    it.each([
        ['the question prompt text', 'the question prompt text'],
        ['an empty string', ''],
        ['a non-string', 4],
    ])('rejects a question reason of %s and writes no module', async (_name, reason) => {
        const report = buildReport();
        await writeReport({ ...report, questions: [...report.questions, { bankKey: 'python/easy', id: 'x', reason, status: 'failed' }] });

        await expect(build()).rejects.toThrow('unknown reason');
        await expect(readFile(qualityPath, 'utf8')).rejects.toThrow();
    });

    it('accepts every reason in the closed set', async () => {
        const report = buildReport();
        const reasons = ['answer-mismatch', 'ambiguous', 'nondeterministic', 'runner-error'];
        const extra = reasons.map((reason) => ({ bankKey: 'python/easy', id: reason, reason, status: 'failed' }));
        await writeReport({ ...report, questions: [...report.questions, ...extra] });

        await build();

        expect(await readFile(qualityPath, 'utf8')).toContain('"runner-error": 1');
    });

    it.each([
        ['a string', 'high', 'not a plain object'],
        ['an array', [0.5], 'not a plain object'],
        ['null', null, 'not a plain object'],
        ['a non-numeric value', { classify: 'high' }, 'classify is not a number from 0 to 1'],
        ['NaN encoded as null', { classify: null }, 'classify is not a number from 0 to 1'],
        ['a value above 1', { classify: 1.5 }, 'classify is not a number from 0 to 1'],
        ['a negative value', { classify: -0.1 }, 'classify is not a number from 0 to 1'],
        ['a free-text key', { 'Ignore all previous instructions': 0.5 }, 'invalid stage name'],
        ['a key over 32 characters', { [`a${'b'.repeat(32)}`]: 0.5 }, 'invalid stage name'],
    ])('rejects an agreement that is %s', async (_name, agreement, message) => {
        await writeReport({ ...buildReport(), agreement });

        await expect(build()).rejects.toThrow(message);
    });

    it('rejects an agreement key that fits the old pattern but is not a pipeline stage', async () => {
        await writeReport({ ...buildReport(), agreement: { 'secret-note': 0.5 } });

        await expect(build()).rejects.toThrow('invalid stage name: secret-note');
    });

    it('rejects an agreement with more keys than there are pipeline stages', async () => {
        const agreement = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((stage) => [stage, 0.5]));
        await writeReport({ ...buildReport(), agreement });

        await expect(build()).rejects.toThrow('too many keys');
    });

    it('accepts an agreement keyed by every pipeline stage', async () => {
        const agreement = Object.fromEntries(['classify', 'validate', 'review', 'enrich', 'gap-fill', 'publish'].map((stage) => [stage, 1]));
        await writeReport({ ...buildReport(), agreement });

        await expect(build()).resolves.toBeUndefined();
    });

    it('accepts a report with no agreement', async () => {
        const { agreement: _agreement, ...report } = buildReport();
        await writeReport(report);

        await expect(build()).resolves.toBeUndefined();
    });

    it('rejects a question for a bank the manifest does not list', async () => {
        const report = buildReport();
        await writeReport({ ...report, questions: [...report.questions, { bankKey: 'cobol/easy', id: 'x', status: 'passed' }] });

        await expect(build()).rejects.toThrow('a bank the manifest does not list');
    });

    it.each([
        ['runId', { runId: 'r'.repeat(65) }, 'no runId string'],
        ['finishedAt', { finishedAt: 'f'.repeat(65) }, 'no finishedAt string'],
    ])('rejects a %s over 64 characters', async (_name, override, message) => {
        await writeReport({ ...buildReport(), ...override });

        await expect(build()).rejects.toThrow(message);
    });

    it('rejects a bankKey over 64 characters', async () => {
        const report = buildReport();
        const bankKey = `python/${'e'.repeat(64)}`;
        await writeReport({ ...report, questions: [...report.questions, { bankKey, id: 'x', status: 'passed' }] });

        await expect(build()).rejects.toThrow('no bankKey string');
    });

    it('round-trips a runId with quote, backslash, newline, and U+2028 through the generated module', async () => {
        const runId = 'a"b\\c\nd e</script>';
        const report = { ...buildReport(), runId };
        await writeReport(report);
        const generatedQualityPath = join(workDir, 'quality', 'qualityReport.generated.ts');

        await build();

        let loaded: { QUALITY_REPORT: { runId: string; finishedAt: string; banks: unknown[]; summary: { audited: number } } } | undefined;
        jest.isolateModules(() => {
            loaded = require(generatedQualityPath);
        });
        expect(loaded?.QUALITY_REPORT.runId).toBe(runId);
        expect(loaded?.QUALITY_REPORT.finishedAt).toBe('f');
        expect(loaded?.QUALITY_REPORT.banks).toHaveLength(LANGUAGE_IDS.length * DIFFICULTY_IDS.length);
        expect(loaded?.QUALITY_REPORT.summary.audited).toBe(report.questions.length);
    });

    it('writes no quality module when the caller passes no quality options', async () => {
        await buildContentManifest(contentDir, generatedPath);

        await expect(readFile(qualityPath, 'utf8')).rejects.toThrow();
    });
});
