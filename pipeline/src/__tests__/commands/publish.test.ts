// `pipeline publish` against real temp directories and the real manifest build: only validated
// or human-reviewed questions are written, a failed one never is, a bank that fails the publish
// validator is refused whole, paid banks stay out of the public content dir, and the rebuilt
// manifest carries topic counts and bumps a content version only for a bank that changed.
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { publish } from '../../commands/publish.js';

const HASH = '0123456789abcdef'.repeat(4);
const TOPICS = ['numbers-and-math', 'strings'];
const TAG = 'python.truthy-strings';
const BUILD_SCRIPT = new URL('../../../../scripts/buildContentManifest.mjs', import.meta.url).href;

type Json = Record<string, unknown>;

interface Dirs {
    contentDir: string;
    contentRoot: string;
    pipelineDir: string;
    root: string;
}

let dirs: Dirs;

async function writeJson(file: string, value: unknown): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(file: string): Promise<Json> {
    return JSON.parse(await readFile(file, 'utf8')) as Json;
}

function buildQuestion(id: string, over: Json = {}): Json {
    return {
        answerIndex: 1,
        choices: [{ text: 'A' }, { text: 'B' }, { text: 'C' }],
        id,
        prompt: `Prompt ${id}`,
        provenance: { isHumanReviewed: false, source: 'original', validation: { method: 'judged', status: 'pending' } },
        query: { explanation: 'Because.', title: 'Why' },
        type: 'mc',
        ...over,
    };
}

function buildEntry(path: string, access: 'free' | 'paid', difficulty: string): Json {
    const productId = access === 'paid' ? { productId: `syntactical.python.${difficulty}` } : {};
    return { access, contentVersion: 1, hash: HASH, path, topicCounts: {}, ...productId };
}

// Stages classify and enrich output for the given question ids under `outRoot`.
async function stage(outRoot: string, difficulty: string, ids: string[]): Promise<void> {
    await writeJson(
        join(outRoot, 'classifications', 'python', `${difficulty}.json`),
        Object.fromEntries(ids.map((id) => [id, { confidence: 0.9, topic: 'strings' }])),
    );
    await writeJson(
        join(outRoot, 'enrichment', 'python', `${difficulty}.json`),
        Object.fromEntries(
            ids.map((id) => [
                id,
                [0, 2].map((choiceIndex) => ({ choiceIndex, misconceptionId: TAG, rationale: `why ${choiceIndex}` })),
            ]),
        ),
    );
}

// An id starting `m-` belongs to the paid python/medium bank, every other id to python/easy.
async function writeReport(statuses: Record<string, string>): Promise<void> {
    await writeJson(join(dirs.pipelineDir, 'reports', 'latest.json'), {
        counts: {},
        finishedAt: 'f',
        questions: Object.entries(statuses).map(([id, status]) => ({
            bankKey: id.startsWith('m-') ? 'python/medium' : 'python/easy',
            id,
            status,
            ...(status === 'passed' ? { runtimeVersion: 'python 3.13' } : {}),
        })),
        runId: 'r',
        stage: 'validate',
        startedAt: 's',
    });
}

async function writeDecisions(outRoot: string, name: string, decisions: Record<string, 'approve' | 'reject'>) {
    await writeJson(join(outRoot, 'review', 'decisions', `${name}.json`), {
        decisions: Object.fromEntries(
            Object.entries(decisions).map(([id, decision]) => [
                id,
                { decision, fingerprint: 'f', provenance: { isHumanReviewed: decision === 'approve' } },
            ]),
        ),
        schemaVersion: 1,
    });
}

function buildManifest(): Json {
    return {
        languages: [
            {
                banks: {
                    easy: buildEntry('python/easy.json', 'free', 'easy'),
                    medium: buildEntry('python/medium.json', 'paid', 'medium'),
                },
                glyph: 'PY',
                grammar: 'python',
                id: 'python',
                label: 'Python',
                misconceptions: [],
                tagline: 'T',
                topics: [],
            },
        ],
        schemaVersion: 2,
    };
}

async function build(contentRoot: string): Promise<void> {
    const { contentDir, pipelineDir } = dirs;
    const { buildContentManifest } = (await import(BUILD_SCRIPT)) as {
        buildContentManifest: (...args: unknown[]) => Promise<void>;
    };
    const generated = join(dirs.root, 'generated');
    await buildContentManifest(
        contentDir,
        { banksPath: join(generated, 'banks.ts'), manifestPath: join(generated, 'manifest.ts') },
        undefined,
        join(pipelineDir, 'taxonomy'),
        contentRoot,
    );
}

function run(overrides: { buildManifest?: (root: string) => Promise<void> } = {}) {
    const logs: string[] = [];
    const promise = publish({
        buildManifest: build,
        ...dirs,
        log: (line) => logs.push(line),
        newRunId: () => 'run-1',
        now: () => '2026-10-03T00:00:00.000Z',
        ...overrides,
    });
    return promise.then((result) => ({ ...result, logs }));
}

async function readBank(file: string): Promise<{ questions: Json[] }> {
    return (await readJson(file)) as { questions: Json[] };
}

function readIds(bank: { questions: Json[] }): unknown[] {
    return bank.questions.map(({ id }) => id);
}

beforeEach(async () => {
    const root = await mkdtemp(join(tmpdir(), 'publish-'));
    const repo = join(root, 'repo');
    dirs = {
        contentDir: join(repo, 'content'),
        contentRoot: join(root, 'private'),
        pipelineDir: join(repo, 'pipeline'),
        root,
    };
    await mkdir(dirs.contentRoot, { recursive: true });
    await writeJson(join(dirs.contentDir, 'manifest.json'), buildManifest());
    await writeJson(join(dirs.pipelineDir, 'topics.json'), { python: TOPICS });
    await writeJson(join(dirs.pipelineDir, 'taxonomy', 'python.json'), [{ description: 'Thinks "0" is falsy', id: TAG }]);
    await writeJson(join(dirs.contentDir, 'python', 'easy.json'), {
        questions: [buildQuestion('q-1'), buildQuestion('q-2')],
        schemaVersion: 2,
    });
    await writeJson(join(dirs.contentRoot, 'python', 'medium.json'), {
        questions: [buildQuestion('m-1')],
        schemaVersion: 2,
    });
    await stage(dirs.pipelineDir, 'easy', ['q-1', 'q-2']);
    await stage(dirs.contentRoot, 'medium', ['m-1']);
});

afterEach(async () => {
    await rm(dirs.root, { force: true, recursive: true });
});

describe('publish: which questions are written', () => {
    it('writes a passed question with its topic, rationales, and executed provenance', async () => {
        await writeReport({ 'q-1': 'passed', 'q-2': 'passed' });
        await run();

        const [first] = (await readBank(join(dirs.contentDir, 'python', 'easy.json'))).questions;
        expect(first).toMatchObject({
            choices: [{ misconceptionId: TAG, rationale: 'why 0', text: 'A' }, { text: 'B' }, { rationale: 'why 2' }],
            provenance: {
                isHumanReviewed: false,
                runtimeVersion: 'python 3.13',
                validation: { method: 'executed', status: 'passed' },
            },
            topic: 'strings',
        });
    });

    it('refuses a question that is neither passed nor human-reviewed and reports it', async () => {
        await writeReport({ 'q-1': 'passed', 'q-2': 'not-executable' });
        const { banks, logs } = await run();

        expect(readIds(await readBank(join(dirs.contentDir, 'python', 'easy.json')))).toEqual(['q-1']);
        expect(banks['python/easy']?.refused).toEqual([{ id: 'q-2', reason: 'unvalidated-unreviewed' }]);
        expect(logs.join('\n')).toContain('q-2: refused (unvalidated-unreviewed)');
    });

    it('writes a human-approved question that could not be executed, still pending, marked reviewed', async () => {
        await writeReport({ 'q-1': 'passed', 'q-2': 'not-executable' });
        await writeDecisions(dirs.pipelineDir, 'python-easy', { 'q-2': 'approve' });
        await run();

        const { questions } = await readBank(join(dirs.contentDir, 'python', 'easy.json'));
        expect(questions[1]).toMatchObject({
            id: 'q-2',
            provenance: { isHumanReviewed: true, validation: { status: 'pending' } },
        });
    });

    it('never writes a failed question, even one a human approved', async () => {
        await writeReport({ 'q-1': 'passed', 'q-2': 'failed' });
        await writeDecisions(dirs.pipelineDir, 'python-easy', { 'q-2': 'approve' });
        const { banks } = await run();

        expect(readIds(await readBank(join(dirs.contentDir, 'python', 'easy.json')))).toEqual(['q-1']);
        expect(banks['python/easy']?.refused).toEqual([{ id: 'q-2', reason: 'validation-failed' }]);
    });

    it('never writes a question the owner rejected, even one that passed', async () => {
        await writeReport({ 'q-1': 'passed', 'q-2': 'passed' });
        await writeDecisions(dirs.pipelineDir, 'python-easy', { 'q-2': 'reject' });
        const { banks } = await run();

        expect(banks['python/easy']?.refused).toEqual([{ id: 'q-2', reason: 'rejected' }]);
    });

    it('adds a staged generated question that passed and ignores one whose id the bank already has', async () => {
        await writeReport({ 'q-1': 'passed', 'q-2': 'passed' });
        const passed = { isHumanReviewed: false, source: 'generated', validation: { method: 'executed', status: 'passed' } };
        await writeJson(join(dirs.pipelineDir, 'generated', 'python', 'easy.json'), {
            questions: [
                buildQuestion('g-1', { provenance: passed, topic: 'strings' }),
                buildQuestion('q-1', { prompt: 'duplicate id' }),
            ],
            schemaVersion: 2,
        });
        await stage(dirs.pipelineDir, 'easy', ['q-1', 'q-2', 'g-1']);
        await run();

        const { questions } = await readBank(join(dirs.contentDir, 'python', 'easy.json'));
        expect(readIds({ questions })).toEqual(['q-1', 'q-2', 'g-1']);
        expect(questions[0]).toMatchObject({ prompt: 'Prompt q-1' });
    });
});

describe('publish: bank-level refusal', () => {
    it('refuses the whole bank on any publish-validator problem and writes nothing', async () => {
        await writeReport({ 'q-1': 'passed', 'q-2': 'passed' });
        // q-2 loses its enrichment, so its wrong choices have no rationale.
        await writeJson(join(dirs.pipelineDir, 'enrichment', 'python', 'easy.json'), {
            'q-1': [0, 2].map((choiceIndex) => ({ choiceIndex, misconceptionId: TAG, rationale: 'r' })),
        });
        const before = await readFile(join(dirs.contentDir, 'python', 'easy.json'), 'utf8');
        const { banks } = await run();

        expect(banks['python/easy']).toMatchObject({ isWritten: false, problems: [{ id: 'q-2', rule: 'missing-rationale' }, { id: 'q-2', rule: 'missing-rationale' }] });
        expect(await readFile(join(dirs.contentDir, 'python', 'easy.json'), 'utf8')).toBe(before);
    });

    it('does not rebuild the manifest when no bank was written', async () => {
        await writeReport({ 'q-1': 'failed', 'q-2': 'failed' });
        let builds = 0;
        const { banks } = await run({
            buildManifest: async () => {
                builds += 1;
            },
        });

        expect(banks['python/easy']?.isWritten).toBe(false);
        expect(banks['python/medium']?.isWritten).toBe(false);
        expect(builds).toBe(0);
    });
});

describe('publish: paid banks', () => {
    it('writes a paid bank only under the content root and reads its staging from there', async () => {
        await writeReport({ 'm-1': 'passed' });
        const publicPaid = join(dirs.contentDir, 'python', 'medium.json');
        await run();

        expect(await stat(publicPaid).then(() => true, () => false)).toBe(false);
        const { questions } = await readBank(join(dirs.contentRoot, 'python', 'medium.json'));
        expect(questions).toHaveLength(1);
        expect(questions[0]).toMatchObject({ id: 'm-1', topic: 'strings' });
    });

    it('moves a paid bank still in the content dir to the content root and leaves the public copy alone', async () => {
        await rm(join(dirs.contentRoot, 'python', 'medium.json'));
        const publicPaid = join(dirs.contentDir, 'python', 'medium.json');
        await writeJson(publicPaid, { questions: [buildQuestion('m-1')], schemaVersion: 2 });
        const before = await readFile(publicPaid, 'utf8');
        await writeReport({ 'm-1': 'passed' });
        await run();

        expect(readIds(await readBank(join(dirs.contentRoot, 'python', 'medium.json')))).toEqual(['m-1']);
        expect(await readFile(publicPaid, 'utf8')).toBe(before);
    });
});

describe('publish: manifest rebuild', () => {
    it('records topic counts and bumps the content version only for banks whose hash changed', async () => {
        await writeReport({ 'm-1': 'passed', 'q-1': 'passed', 'q-2': 'passed' });
        await run();
        const first = (await readJson(join(dirs.contentDir, 'manifest.json'))) as { languages: Json[] };
        const banks = (first.languages[0]?.banks ?? {}) as Record<string, Json>;
        expect(banks.easy).toMatchObject({ contentVersion: 2, topicCounts: { strings: 2 } });
        expect(banks.medium).toMatchObject({ contentVersion: 2, topicCounts: { strings: 1 } });
        expect(first.languages[0]?.topics).toEqual([
            { id: 'numbers-and-math', label: 'Numbers and math' },
            { id: 'strings', label: 'Strings' },
        ]);

        // Nothing changed: a second publish rewrites the same bytes, so no version moves.
        await run();
        const second = (await readJson(join(dirs.contentDir, 'manifest.json'))) as { languages: Json[] };
        expect(second.languages[0]?.banks).toEqual(banks);

        // One bank changes: only it moves.
        await writeDecisions(dirs.pipelineDir, 'python-easy', { 'q-2': 'reject' });
        await run();
        const third = (await readJson(join(dirs.contentDir, 'manifest.json'))) as { languages: Json[] };
        const after = (third.languages[0]?.banks ?? {}) as Record<string, Json>;
        expect(after.easy).toMatchObject({ contentVersion: 3, topicCounts: { strings: 1 } });
        expect(after.medium).toMatchObject({ contentVersion: 2 });
    });
});
