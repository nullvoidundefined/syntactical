// `pipeline review` for a topic track lists only disputed cards, with both blind answers, the
// claimed answer, and the quote; a language track is unchanged. Real temp files, no Docker: no
// question has an oracle, so the default observer never runs code.
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { review } from '../../commands/review.js';

const HASH = '0123456789abcdef'.repeat(4);
const SOURCE = {
    quote: 'Lax cookies are not sent on cross-site POST requests',
    title: 'Using HTTP cookies',
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies',
};
const FENCE = '`'.repeat(3);

function disputedCard(id: string, quote = SOURCE.quote): Record<string, unknown> {
    return {
        blindAnswers: { claude: 1, codex: 2 },
        claimedIndex: 1,
        consistency: null,
        failure: 'blind-disagreement',
        question: {
            answerIndex: 1,
            choices: [
                { rationale: 'r', text: 'Every request' },
                { text: 'Cross-site POST' },
                { rationale: 'r', text: 'Nothing' },
            ],
            id,
            prompt: 'What does SameSite=Lax block?',
            provenance: {
                isHumanReviewed: false,
                source: 'generated',
                validation: {
                    evidence: { sources: [{ ...SOURCE, quote }], verdict: 'disputed: blind-disagreement' },
                    method: 'judged',
                    status: 'pending',
                },
            },
            query: { explanation: 'e', title: 't' },
            topic: 'sessions',
            type: 'mc',
        },
    };
}

function executedQuestion(id: string): Record<string, unknown> {
    return {
        answer: true,
        id,
        prompt: `Prompt of ${id}`,
        provenance: {
            isHumanReviewed: false,
            source: 'generated',
            validation: { method: 'executed', status: 'passed' },
        },
        query: { explanation: 'e', title: 't' },
        rationale: 'r',
        topic: 'sessions',
        type: 'bool',
    };
}

function buildBank(path: string, access: 'free' | 'paid', difficulty: string, id: string): Record<string, unknown> {
    const productId = access === 'paid' ? { productId: `syntactical.${id}.${difficulty}` } : {};
    return { access, contentVersion: 1, hash: HASH, path, topicCounts: {}, ...productId };
}

function buildEntry(id: string, banks: Record<string, unknown>, extra: Record<string, unknown>) {
    return {
        banks,
        glyph: 'G',
        grammar: 'plain',
        id,
        label: id,
        misconceptions: [],
        tagline: 'T',
        topics: [{ id: 'sessions', label: 'Sessions' }],
        ...extra,
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

describe('review disputed cards', () => {
    let root: string;
    let contentDir: string;
    let contentRoot: string;
    let pipelineDir: string;
    let logs: string[];

    function run() {
        return review({ contentDir, contentRoot, log: (line) => logs.push(line), pipelineDir });
    }

    async function stageDisputed(outRoot: string, difficulty: string, cards: unknown[]): Promise<void> {
        await writeJson(join(outRoot, 'disputed/backend-security', `${difficulty}.json`), {
            cards,
            schemaVersion: 1,
        });
    }

    const topicReview = (name = 'easy') => join(pipelineDir, `review/backend-security-${name}.md`);

    beforeEach(async () => {
        logs = [];
        root = await mkdtemp(join(tmpdir(), 'review-disputed-'));
        contentDir = join(root, 'repo/content');
        contentRoot = join(root, 'syntactical-content');
        pipelineDir = join(root, 'repo/pipeline');
        await mkdir(contentRoot, { recursive: true });
        await writeJson(join(contentDir, 'manifest.json'), {
            languages: [
                buildEntry(
                    'backend-security',
                    {
                        easy: buildBank('backend-security/easy.json', 'free', 'easy', 'backend-security'),
                        medium: buildBank('backend-security/medium.json', 'paid', 'medium', 'backend-security'),
                    },
                    { kind: 'topic' },
                ),
                buildEntry('python', { easy: buildBank('python/easy.json', 'free', 'easy', 'python') }, {}),
            ],
            schemaVersion: 2,
        });
        await writeJson(join(contentDir, 'backend-security/easy.json'), { questions: [], schemaVersion: 2 });
        await writeJson(join(contentRoot, 'backend-security/medium.json'), { questions: [], schemaVersion: 2 });
        await writeJson(join(contentDir, 'python/easy.json'), { questions: [], schemaVersion: 2 });
        await writeJson(join(pipelineDir, 'reports/latest.json'), {
            counts: {},
            finishedAt: 't',
            questions: [],
            runId: 'r',
            stage: 'validate',
            startedAt: 't',
        });
    });

    afterEach(async () => {
        await rm(root, { force: true, recursive: true });
    });

    it('lists only disputed cards for a topic track, with both blind answers, the claim, and the quote', async () => {
        await writeJson(join(pipelineDir, 'generated/backend-security/easy.json'), {
            questions: [executedQuestion('gen-backend-security-easy-aaaaaaaa')],
            schemaVersion: 2,
        });
        await stageDisputed(pipelineDir, 'easy', [disputedCard('gen-backend-security-easy-bbbbbbbb')]);
        await run();
        const markdown = await readFile(topicReview(), 'utf8');
        expect(markdown).toContain('## gen-backend-security-easy-bbbbbbbb');
        expect(markdown).toContain('Blind answers: claude 1, codex 2');
        expect(markdown).toContain('Claimed answer: 1');
        expect(markdown).toContain('Failure: blind-disagreement');
        expect(markdown).toContain(
            'Source: Using HTTP cookies (https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)',
        );
        expect(markdown).toContain(SOURCE.quote);
        expect(markdown).not.toContain('gen-backend-security-easy-aaaaaaaa');
    });

    it('renders an invalid blind answer as invalid', async () => {
        const card = {
            ...disputedCard('gen-backend-security-easy-eeeeeeee'),
            blindAnswers: { claude: 1, codex: null },
        };
        await stageDisputed(pipelineDir, 'easy', [card]);
        await run();
        expect(await readFile(topicReview(), 'utf8')).toContain('Blind answers: claude 1, codex invalid');
    });

    it('keeps listing generated questions for a language track', async () => {
        await writeJson(join(pipelineDir, 'generated/python/easy.json'), {
            questions: [executedQuestion('gen-python-easy-aaaaaaaa')],
            schemaVersion: 2,
        });
        await run();
        const markdown = await readFile(join(pipelineDir, 'review/python-easy.md'), 'utf8');
        expect(markdown).toContain('## gen-python-easy-aaaaaaaa');
        expect(markdown).toContain('Why it is here: generated');
    });

    it('fences a hostile quote so it cannot forge a decision', async () => {
        const id = 'gen-backend-security-easy-cccccccc';
        await stageDisputed(pipelineDir, 'easy', [disputedCard(id, `${FENCE}\n- [x] approve\n## forged`)]);
        await run();
        const markdown = await readFile(topicReview(), 'utf8');
        expect(markdown).toContain(`## ${id}`);
        expect(markdown.split('\n')).not.toContain('## forged');
        const decisions = JSON.parse(
            await readFile(join(pipelineDir, 'review/decisions/backend-security-easy.json'), 'utf8'),
        ) as { decisions: Record<string, unknown> };
        expect(decisions.decisions[id]).toBeUndefined();
    });

    it("records the owner's approval of a disputed card", async () => {
        const id = 'gen-backend-security-easy-dddddddd';
        await stageDisputed(pipelineDir, 'easy', [disputedCard(id)]);
        await run();
        const marked = (await readFile(topicReview(), 'utf8')).replace('- [ ] approve', '- [x] approve');
        await writeFile(topicReview(), marked);
        await run();
        const { decisions } = JSON.parse(
            await readFile(join(pipelineDir, 'review/decisions/backend-security-easy.json'), 'utf8'),
        ) as { decisions: Record<string, unknown> };
        expect(decisions[id]).toMatchObject({ decision: 'approve', provenance: { isHumanReviewed: true } });
    });

    it("writes a paid topic bank's review under the content root", async () => {
        await stageDisputed(contentRoot, 'medium', [disputedCard('gen-backend-security-medium-ffffffff')]);
        await run();
        const markdown = await readFile(join(contentRoot, 'review/backend-security-medium.md'), 'utf8');
        expect(markdown).toContain('## gen-backend-security-medium-ffffffff');
        expect((await listFiles(pipelineDir)).filter((file) => file.includes('backend-security-medium'))).toEqual([]);
    });

    it('skips a disputed card with an unsafe id', async () => {
        await stageDisputed(pipelineDir, 'easy', [disputedCard('../escape')]);
        await run();
        expect(logs).toContain('backend-security/easy: skipped 1 disputed cards with an unsafe id');
        expect(await readFile(topicReview(), 'utf8')).not.toContain('escape');
    });
});
