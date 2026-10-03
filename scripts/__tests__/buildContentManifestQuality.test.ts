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

        await expect(build()).rejects.toThrow();
    });

    it('writes no quality module when the caller passes no quality options', async () => {
        await buildContentManifest(contentDir, generatedPath);

        await expect(readFile(qualityPath, 'utf8')).rejects.toThrow();
    });
});
