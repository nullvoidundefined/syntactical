// `pipeline review` against real temp files and a fake oracle observer: what is listed,
// the sample, where free and paid output goes, decisions, reruns, and untouched banks.
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { review } from '../../commands/review.js';
import { pickSample } from '../../services/review/pickSample.js';

const HASH = '0123456789abcdef'.repeat(4);
const PAID_TEXT = 'PAID-SECRET-PROMPT';
const SAMPLE_KIND = 'sample of executed questions';

function buildEntry(path: string, access: 'free' | 'paid'): Record<string, unknown> {
    const productId = access === 'paid' ? { productId: 'syntactical.python.medium' } : {};
    return { access, contentVersion: 1, hash: HASH, path, topicCounts: {}, ...productId };
}

function buildQuestion(id: string, prompt = `prompt of ${id}`): Record<string, unknown> {
    return {
        answerIndex: 0,
        choices: [{ text: '1' }, { text: '2' }],
        id,
        prompt,
        provenance: { isHumanReviewed: false, source: 'original', validation: { method: 'executed', status: 'passed' } },
        query: { prompt: 'q' },
        type: 'mc',
    };
}

async function writeJson(file: string, value: unknown): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(value));
}

async function listFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
    return entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
}

// The sample ranks ids by this hash, lowest first; tests use it to push an id out of the sample.
function rankOf(id: string): string {
    return createHash('sha256').update(`python/easy:${id}`).digest('hex');
}

// `count` new ids that all rank ahead of `target`, so the sample can no longer include it.
function outrank(target: string, count: number): string[] {
    const ahead: string[] = [];
    for (let index = 0; ahead.length < count && index < 10_000; index += 1) {
        if (rankOf(`extra-${index}`) < rankOf(target)) {
            ahead.push(`extra-${index}`);
        }
    }
    return ahead;
}

function headingsOf(markdown: string): string[] {
    return [...markdown.matchAll(/^## (\S+) <!-- fp:/gm)].map((match) => match[1] as string);
}

describe('review', () => {
    let contentDir: string;
    let contentRoot: string;
    let pipelineDir: string;
    let observed: (id: string) => string;
    const logs: string[] = [];
    const FREE_IDS = Array.from({ length: 30 }, (_, index) => `q-${index + 1}`);

    function run() {
        return review({
            contentDir,
            contentRoot,
            log: (line) => logs.push(line),
            observe: async (_bankKey, question) => observed(question.id),
            pipelineDir,
        });
    }

    async function freeReview(): Promise<string> {
        return readFile(join(pipelineDir, 'review/python-easy.md'), 'utf8');
    }

    // Ticks one box of one item in a review file the way the owner would.
    async function tick(id: string, box: 'approve' | 'reject', reason = 'wrong answer'): Promise<void> {
        const file = join(pipelineDir, 'review/python-easy.md');
        const lines = (await readFile(file, 'utf8')).split('\n');
        const start = lines.findIndex((line) => line.startsWith(`## ${id} `));
        for (let index = start; index < lines.length; index += 1) {
            if (box === 'approve' && lines[index] === '- [ ] approve') {
                lines[index] = '- [x] approve';
                break;
            }
            if (box === 'reject' && lines[index]?.startsWith('- [ ] reject:')) {
                lines[index] = `- [x] reject: ${reason}`;
                break;
            }
        }
        await writeFile(file, lines.join('\n'));
    }

    async function readDecisions(): Promise<Record<string, Record<string, unknown>>> {
        const file = join(pipelineDir, 'review/decisions/python-easy.json');
        return (JSON.parse(await readFile(file, 'utf8')) as { decisions: Record<string, Record<string, unknown>> })
            .decisions;
    }

    beforeEach(async () => {
        logs.length = 0;
        observed = (id) => `out-${id}`;
        const root = await mkdtemp(join(tmpdir(), 'review-root-'));
        contentDir = join(root, 'repo/content');
        contentRoot = join(root, 'syntactical-content');
        pipelineDir = join(root, 'repo/pipeline/');
        await mkdir(contentRoot, { recursive: true });
        const language = {
            banks: {
                easy: buildEntry('python/easy.json', 'free'),
                medium: buildEntry('python/medium.json', 'paid'),
            },
            glyph: 'G',
            grammar: 'plain',
            id: 'python',
            label: 'L',
            misconceptions: [],
            tagline: 'T',
            topics: [{ id: 'strings', label: 'Strings' }],
        };
        await writeJson(join(contentDir, 'manifest.json'), { languages: [language], schemaVersion: 2 });
        await writeJson(join(contentDir, 'python/easy.json'), {
            questions: [...FREE_IDS, 'q-bad'].map((id) => buildQuestion(id)),
        });
        await writeJson(join(contentDir, 'python/medium.json'), {
            questions: ['paid-1', 'paid-2', 'paid-3', 'paid-4'].map((id) => buildQuestion(id, PAID_TEXT)),
        });
        await writeJson(join(pipelineDir, 'reports/latest.json'), {
            counts: {},
            finishedAt: 't',
            questions: [
                ...FREE_IDS.map((id) => ({ bankKey: 'python/easy', id, status: 'passed' })),
                { bankKey: 'python/easy', id: 'q-bad', reason: 'answer-mismatch', status: 'failed' },
                ...['paid-1', 'paid-2', 'paid-3', 'paid-4'].map((id) => ({
                    bankKey: 'python/medium',
                    id,
                    status: 'passed',
                })),
            ],
            runId: 'r',
            stage: 'validate',
            startedAt: 't',
        });
        await writeJson(join(pipelineDir, 'review-queue/python/easy/q-3.json'), {
            bankKey: 'python/easy',
            confidence: 0.4,
            id: 'q-3',
            reason: 'low-confidence',
            suggestedTopic: 'strings',
        });
        await writeJson(join(pipelineDir, 'generated/python/easy.json'), {
            questions: [buildQuestion('gen-1', 'a generated prompt')],
            schemaVersion: 2,
        });
        await writeJson(join(pipelineDir, 'enrichment/python/easy.json'), {
            'q-5': [{ choiceIndex: 1, misconceptionId: 'off-by-one', rationale: 'Counting starts at zero.' }],
        });
    });

    it('lists every pending item with question, oracle output, topic, rationales, and checkboxes', async () => {
        await run();
        const markdown = await freeReview();
        const sections = markdown.split(/^## /m);
        const byId = (id: string): string => sections.find((text) => text.startsWith(`${id} `)) ?? '';
        expect(byId('q-3')).toContain('review-queue (low-confidence)');
        expect(byId('q-3')).toContain('Proposed topic: strings');
        expect(byId('q-3')).toContain('prompt of q-3');
        expect(byId('q-3')).toContain('out-q-3');
        expect(byId('gen-1')).toContain('generated');
        expect(byId('gen-1')).toContain('a generated prompt');
        expect(byId('q-bad')).toContain('validation failed');
        expect(byId('q-5')).toContain('enrichment awaiting approval');
        expect(byId('q-5')).toContain('Counting starts at zero.');
        expect(byId('q-5')).toContain('off-by-one');
        for (const id of ['q-3', 'gen-1', 'q-bad', 'q-5']) {
            expect(byId(id)).toContain('- [ ] approve\n- [ ] reject: <reason>');
        }
    });

    it('adds a deterministic sample of executed questions that is stable across reruns', async () => {
        await run();
        const first = await freeReview();
        const sampled = (text: string): string[] =>
            text
                .split(/^## /m)
                .filter((part) => part.includes(SAMPLE_KIND))
                .map((part) => part.split(' ')[0] as string)
                .sort();
        // 30 executed questions: 10% is 3, the minimum. q-3 and q-5 may be sampled too.
        expect(sampled(first)).toHaveLength(3);
        await run();
        expect(sampled(await freeReview())).toEqual(sampled(first));
        expect(await freeReview()).toBe(first);
    });

    it('samples 10% of a larger bank and never samples a failing question', async () => {
        const many = Array.from({ length: 100 }, (_, index) => `m-${index}`);
        await writeJson(join(contentDir, 'python/easy.json'), {
            questions: [...many, 'q-bad'].map((id) => buildQuestion(id)),
        });
        await writeJson(join(pipelineDir, 'reports/latest.json'), {
            counts: {},
            finishedAt: 't',
            questions: [
                ...many.map((id) => ({ bankKey: 'python/easy', id, status: 'passed' })),
                { bankKey: 'python/easy', id: 'q-bad', status: 'failed' },
            ],
            runId: 'r',
            stage: 'validate',
            startedAt: 't',
        });
        await run();
        const markdown = await freeReview();
        const sampledCount = markdown.split(/^## /m).filter((part) => part.includes(SAMPLE_KIND)).length;
        expect(sampledCount).toBe(10);
        expect(markdown.split(/^## q-bad /m)[1]?.split(/^## /m)[0]).not.toContain(SAMPLE_KIND);
    });

    it('writes a paid bank review only under the content root', async () => {
        await run();
        const paid = await readFile(join(contentRoot, 'review/python-medium.md'), 'utf8');
        expect(paid).toContain(PAID_TEXT);
        const publicFiles = await listFiles(pipelineDir);
        expect(publicFiles.some((file) => file.includes('medium'))).toBe(false);
        for (const file of publicFiles) {
            expect(await readFile(file, 'utf8')).not.toContain(PAID_TEXT);
        }
        expect(logs.join('\n')).not.toContain(PAID_TEXT);
    });

    it('refuses a content root inside the pipeline directory before writing any paid file', async () => {
        contentRoot = join(pipelineDir, 'inside');
        await mkdir(contentRoot, { recursive: true });
        await expect(run()).rejects.toThrow('content root must be outside');
        expect(await listFiles(join(contentRoot))).toEqual([]);
    });

    it('records an approval as provenance.isHumanReviewed and a reject with its reason', async () => {
        await run();
        await tick('q-3', 'approve');
        await tick('gen-1', 'reject', 'distractor is also correct');
        const result = await run();
        const decisions = await readDecisions();
        expect(decisions['q-3']).toMatchObject({ decision: 'approve', provenance: { isHumanReviewed: true } });
        expect(decisions['gen-1']).toMatchObject({
            decision: 'reject',
            provenance: { isHumanReviewed: false },
            reason: 'distractor is also correct',
        });
        expect(Object.keys(decisions).sort()).toEqual(['gen-1', 'q-3']);
        expect(result).toMatchObject({ approved: 1, rejected: 1, problems: 0 });
    });

    it('does not record a reject with no reason, and reports it', async () => {
        await run();
        await tick('q-3', 'reject', '');
        const result = await run();
        expect(await readDecisions()).toEqual({});
        expect(result.problems).toBe(1);
        expect(logs.join('\n')).toContain('reject needs a reason');
    });

    it('keeps decisions for unchanged items across reruns and pre-checks them', async () => {
        await run();
        await tick('q-3', 'approve');
        await run();
        await run();
        expect(Object.keys(await readDecisions())).toEqual(['q-3']);
        const section = (await freeReview()).split(/^## q-3 /m)[1]?.split(/^## /m)[0] ?? '';
        expect(section).toContain('- [x] approve');
        expect(section).toContain('- [ ] reject: <reason>');
    });

    it('drops a decision when its item changed, so the owner is asked again', async () => {
        await run();
        await tick('q-3', 'approve');
        await run();
        observed = (id) => `different-${id}`;
        await run();
        expect(await readDecisions()).toEqual({});
        const section = (await freeReview()).split(/^## q-3 /m)[1]?.split(/^## /m)[0] ?? '';
        expect(section).toContain('- [ ] approve');
    });

    // Rewrites the free bank: `passing` ids pass validation, `failing` ids fail it.
    async function reseed(passing: string[], failing: string[]): Promise<void> {
        await writeJson(join(contentDir, 'python/easy.json'), {
            questions: [...passing, ...failing].map((id) => buildQuestion(id)),
        });
        await writeJson(join(pipelineDir, 'reports/latest.json'), {
            counts: {},
            finishedAt: 't',
            questions: [
                ...passing.map((id) => ({ bankKey: 'python/easy', id, status: 'passed' })),
                ...failing.map((id) => ({ bankKey: 'python/easy', id, status: 'failed' })),
            ],
            runId: 'r',
            stage: 'validate',
            startedAt: 't',
        });
    }

    it('keeps an approval when its item drops out of the sample', async () => {
        await run();
        const sampled = pickSample('python/easy', FREE_IDS).filter((id) => !['q-3', 'q-5'].includes(id));
        // The sampled id with the highest rank hash, so enough new ids can outrank it.
        const target = sampled.sort((left, right) => (rankOf(left) < rankOf(right) ? 1 : -1))[0] as string;
        await tick(target, 'approve');
        await run();
        const grown = [...FREE_IDS, ...outrank(target, 5)];
        expect(pickSample('python/easy', grown)).not.toContain(target);
        await reseed(grown, ['q-bad']);
        await run();
        expect(headingsOf(await freeReview())).not.toContain(target);
        expect(await readDecisions()).toHaveProperty([target, 'provenance', 'isHumanReviewed'], true);
        await run();
        expect(Object.keys(await readDecisions())).toContain(target);
    });

    it('keeps an approval when its item stops being pending', async () => {
        await run();
        await tick('q-bad', 'approve');
        await run();
        // The oracle now passes q-bad, so it is no longer pending; grow the bank until it is not sampled.
        const passing = [...FREE_IDS, 'q-bad', ...outrank('q-bad', 5)];
        expect(pickSample('python/easy', passing)).not.toContain('q-bad');
        await reseed(passing, []);
        await run();
        expect(headingsOf(await freeReview())).not.toContain('q-bad');
        expect(await readDecisions()).toHaveProperty(['q-bad', 'decision'], 'approve');
    });

    it('skips enrichment, generated, and queue entries with unsafe ids and logs them', async () => {
        const rationale = [{ choiceIndex: 0, misconceptionId: 'm', rationale: 'r' }];
        await writeJson(join(pipelineDir, 'enrichment/python/easy.json'), {
            'bad key': rationale,
            'evil\n## forged <!-- fp:0123456789abcdef -->': rationale,
            'q-5': rationale,
        });
        await run();
        const markdown = await freeReview();
        expect(headingsOf(markdown)).toContain('q-5');
        expect(markdown).not.toContain('bad key');
        expect(markdown).not.toContain('forged');
        expect(logs.join('\n')).toContain('skipped 2 enrichment entries with an unsafe id');
    });

    it('lets the owner revoke an approval by unticking it', async () => {
        await run();
        await tick('q-3', 'approve');
        await run();
        const file = join(pipelineDir, 'review/python-easy.md');
        await writeFile(file, (await readFile(file, 'utf8')).replace(/^- \[x\] approve$/m, '- [ ] approve'));
        await run();
        expect(await readDecisions()).toEqual({});
    });

    it('leaves every content bank file and the manifest byte-identical', async () => {
        const files = [join(contentDir, 'manifest.json'), join(contentDir, 'python/easy.json'), join(contentDir, 'python/medium.json')];
        const before = await Promise.all(files.map((file) => readFile(file)));
        await run();
        await tick('q-3', 'approve');
        await run();
        const after = await Promise.all(files.map((file) => readFile(file)));
        expect(after.map((buffer, index) => buffer.equals(before[index] as Buffer))).toEqual([true, true, true]);
        expect(headingsOf(await freeReview())).toContain('q-3');
    });

    it('fails clearly, writing nothing, when validate has not produced a report', async () => {
        await rm(join(pipelineDir, 'reports/latest.json'));
        await expect(run()).rejects.toThrow('run `pipeline validate` first');
        expect(await listFiles(join(pipelineDir, 'review'))).toEqual([]);
    });
});
