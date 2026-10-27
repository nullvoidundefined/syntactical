// `pipeline validate` and `pipeline review` read every bank's oracles from `<pipelineDir>/oracles`, Medium as well
// as Easy. The oracle source and the oracle observer are not injected; the commands read the oracle files
// themselves and hand each oracle to the injected validator.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { review } from '../../commands/review.js';
import { validateContent } from '../../commands/validate.js';
import type { Oracle } from '../../types/Oracle.js';
import { writeJson } from '../fixtures/jsonFiles.js';
import { buildBankEntry, buildLanguage, buildManifest } from '../fixtures/manifest.js';

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

const MEDIUM_IDS = ['medium-1', 'medium-2', 'medium-3', 'medium-4'];

describe('validate and review oracle roots', () => {
    let root: string;
    let contentDir: string;
    let pipelineDir: string;
    let seen: Map<string, Oracle | null>;

    beforeEach(async () => {
        seen = new Map();
        root = await mkdtemp(join(tmpdir(), 'oracle-roots-'));
        contentDir = join(root, 'repo/content');
        pipelineDir = join(root, 'repo/pipeline/');
        const language = buildLanguage({
            banks: { easy: buildBankEntry('python/easy.json'), medium: buildBankEntry('python/medium.json') },
            topics: [{ id: 'strings', label: 'Strings' }],
        });
        await writeJson(join(contentDir, 'manifest.json'), buildManifest(language));
        await writeJson(join(contentDir, 'python/easy.json'), { questions: [buildQuestion('free-1')] });
        await writeJson(join(contentDir, 'python/medium.json'), { questions: MEDIUM_IDS.map(buildQuestion) });
        await writeJson(
            join(pipelineDir, 'oracles/python/medium.json'),
            Object.fromEntries(MEDIUM_IDS.map((id) => [id, oracleOf('MEDIUM-ORACLE')])),
        );
        await writeJson(join(pipelineDir, 'oracles/python/easy.json'), { 'free-1': oracleOf('FREE-ORACLE') });
    });

    afterEach(async () => {
        await rm(root, { force: true, recursive: true });
    });

    it('validate gives each bank its oracle from the pipeline dir', async () => {
        await validateContent({
            contentDir,
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
        for (const id of MEDIUM_IDS) {
            expect(seen.get(id)).toEqual(oracleOf('MEDIUM-ORACLE'));
        }
    });

    it('review observes each bank question with its oracle from the pipeline dir', async () => {
        await writeJson(join(pipelineDir, 'reports/latest.json'), {
            counts: {},
            finishedAt: 't',
            questions: [
                { bankKey: 'python/easy', id: 'free-1', status: 'passed' },
                ...MEDIUM_IDS.map((id) => ({ bankKey: 'python/medium', id, status: 'passed' })),
            ],
            runId: 'r',
            stage: 'validate',
            startedAt: 't',
        });
        await review({
            contentDir,
            log: () => undefined,
            pipelineDir,
            validate: async ({ id }, oracle) => {
                seen.set(id, oracle);
                return { observed: `out-${id}`, status: 'passed' };
            },
        } as Parameters<typeof review>[0]);
        const mediumSeen = MEDIUM_IDS.filter((id) => seen.has(id));
        expect(mediumSeen.length).toBeGreaterThan(0);
        for (const id of mediumSeen) {
            expect(seen.get(id)).toEqual(oracleOf('MEDIUM-ORACLE'));
        }
        expect(seen.get('free-1')).toEqual(oracleOf('FREE-ORACLE'));
    });
});
