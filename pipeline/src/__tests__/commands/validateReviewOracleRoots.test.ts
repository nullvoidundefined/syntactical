// `pipeline validate` and `pipeline review` read a bank's oracles from that bank's own root:
// free banks from `<pipelineDir>/oracles`, paid banks from `<contentRoot>/oracles`, never a paid
// bank's from the pipeline dir. The oracle source and the oracle observer are not injected; the
// commands read the oracle files themselves and hand each oracle to the injected validator.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { review } from '../../commands/review.js';
import { validateContent } from '../../commands/validate.js';
import type { Oracle } from '../../types/Oracle.js';

const HASH = '0123456789abcdef'.repeat(4);

function oracleOf(code: string): Oracle {
    return { code, language: 'python' };
}

function buildQuestion(id: string): Record<string, unknown> {
    return {
        answerIndex: 0,
        choices: [{ text: '1' }, { text: '2' }],
        id,
        prompt: `prompt of ${id}`,
        provenance: {
            isHumanReviewed: false,
            source: 'original',
            validation: { method: 'executed', status: 'passed' },
        },
        query: { prompt: 'q' },
        type: 'mc',
    };
}

async function writeJson(file: string, value: unknown): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(value));
}

const PAID_IDS = ['paid-1', 'paid-2', 'paid-3', 'paid-4'];

describe('validate and review oracle roots', () => {
    let root: string;
    let contentDir: string;
    let contentRoot: string;
    let pipelineDir: string;
    let seen: Map<string, Oracle | null>;

    beforeEach(async () => {
        seen = new Map();
        root = await mkdtemp(join(tmpdir(), 'oracle-roots-'));
        contentDir = join(root, 'repo/content');
        contentRoot = join(root, 'syntactical-content');
        pipelineDir = join(root, 'repo/pipeline/');
        await mkdir(contentRoot, { recursive: true });
        const entry = (access: 'free' | 'paid', difficulty: string) => ({
            access,
            contentVersion: 1,
            hash: HASH,
            path: `python/${difficulty}.json`,
            topicCounts: {},
            ...(access === 'paid' ? { productId: `syntactical.python.${difficulty}` } : {}),
        });
        const language = {
            banks: { easy: entry('free', 'easy'), medium: entry('paid', 'medium') },
            glyph: 'G',
            grammar: 'plain',
            id: 'python',
            label: 'L',
            misconceptions: [],
            tagline: 'T',
            topics: [{ id: 'strings', label: 'Strings' }],
        };
        await writeJson(join(contentDir, 'manifest.json'), { languages: [language], schemaVersion: 2 });
        await writeJson(join(contentDir, 'python/easy.json'), { questions: [buildQuestion('free-1')] });
        await writeJson(join(contentRoot, 'python/medium.json'), { questions: PAID_IDS.map(buildQuestion) });
        await writeJson(
            join(contentRoot, 'oracles/python/medium.json'),
            Object.fromEntries(PAID_IDS.map((id) => [id, oracleOf('PAID-ORACLE')])),
        );
        await writeJson(join(pipelineDir, 'oracles/python/easy.json'), { 'free-1': oracleOf('FREE-ORACLE') });
        // A decoy for the paid bank in the public tree: it must never be read.
        await writeJson(
            join(pipelineDir, 'oracles/python/medium.json'),
            Object.fromEntries(PAID_IDS.map((id) => [id, oracleOf('DECOY-ORACLE')])),
        );
    });

    afterEach(async () => {
        await rm(root, { force: true, recursive: true });
    });

    it('validate gives each bank the oracle from its own root', async () => {
        await validateContent({
            contentDir,
            contentRoot,
            newRunId: () => 'run-1',
            now: () => '2026-10-05T00:00:00.000Z',
            pipelineDir,
            reportsDir: join(pipelineDir, 'reports'),
            validate: async ({ id }, oracle) => {
                seen.set(id, oracle);
                return { status: 'passed' };
            },
        } as Parameters<typeof validateContent>[0]);
        expect(seen.get('free-1')).toEqual(oracleOf('FREE-ORACLE'));
        for (const id of PAID_IDS) {
            expect(seen.get(id)).toEqual(oracleOf('PAID-ORACLE'));
        }
    });

    it('validate treats a paid question with an oracle only in the pipeline dir as having none', async () => {
        await rm(join(contentRoot, 'oracles'), { force: true, recursive: true });
        await validateContent({
            contentDir,
            contentRoot,
            newRunId: () => 'run-1',
            now: () => '2026-10-05T00:00:00.000Z',
            pipelineDir,
            reportsDir: join(pipelineDir, 'reports'),
            validate: async ({ id }, oracle) => {
                seen.set(id, oracle);
                return { status: 'passed' };
            },
        } as Parameters<typeof validateContent>[0]);
        expect(seen.get('paid-1')).toBeNull();
    });

    it('review observes each bank question with the oracle from its own root', async () => {
        await writeJson(join(pipelineDir, 'reports/latest.json'), {
            counts: {},
            finishedAt: 't',
            questions: [
                { bankKey: 'python/easy', id: 'free-1', status: 'passed' },
                ...PAID_IDS.map((id) => ({ bankKey: 'python/medium', id, status: 'passed' })),
            ],
            runId: 'r',
            stage: 'validate',
            startedAt: 't',
        });
        await review({
            contentDir,
            contentRoot,
            log: () => undefined,
            pipelineDir,
            validate: async ({ id }, oracle) => {
                seen.set(id, oracle);
                return { observed: `out-${id}`, status: 'passed' };
            },
        } as Parameters<typeof review>[0]);
        const paidSeen = PAID_IDS.filter((id) => seen.has(id));
        expect(paidSeen.length).toBeGreaterThan(0);
        for (const id of paidSeen) {
            expect(seen.get(id)).toEqual(oracleOf('PAID-ORACLE'));
        }
        expect(seen.get('free-1')).toEqual(oracleOf('FREE-ORACLE'));
    });
});
