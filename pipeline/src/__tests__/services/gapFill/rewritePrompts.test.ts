// rewritePrompts: one model call per bank rewrites each mc prompt into a short, neutral question.
// Only the prompt may change, so every answer the sandbox proved stays proven. A rewrite that fails
// the deterministic checks keeps the original prompt. Fake provider, no Docker.
import type { Question } from '@syntactical/content-schema';
import { describe, expect, it } from 'vitest';

import { rewritePrompts } from '../../../services/gapFill/rewritePrompts.js';
import type { ModelProvider } from '../../../types/ModelProvider.js';

const PROVENANCE = {
    isHumanReviewed: false,
    model: 'fake-model',
    promptVersion: 'generate-batch-v2',
    source: 'generated',
    validation: { method: 'executed', status: 'passed' },
};

function mc(id: string, prompt: string, answer = `answer-${id}`): Question {
    return {
        answerIndex: 2,
        choices: [
            { rationale: 'Tempting but wrong.', text: `wrong-${id}-a` },
            { rationale: 'Tempting but wrong.', text: `wrong-${id}-b` },
            { text: answer },
            { rationale: 'Tempting but wrong.', text: `wrong-${id}-c` },
        ],
        code: `fmt.Println(${id.length})`,
        id,
        prompt,
        provenance: PROVENANCE,
        query: { explanation: 'e', title: 't' },
        topic: 'basics',
        type: 'mc',
    } as Question;
}

function bool(id: string, prompt: string): Question {
    return {
        answer: true,
        code: 'fmt.Println(true)',
        id,
        prompt,
        provenance: PROVENANCE,
        query: { explanation: 'e', title: 't' },
        rationale: 'It prints true.',
        topic: 'basics',
        type: 'bool',
    } as Question;
}

// The provider returns whatever `reply` builds from the request prompt, unparsed.
function buildProvider(reply: (prompt: string) => unknown) {
    const requests: { lenientJson?: boolean; maxAttempts?: number; prompt: string }[] = [];
    const provider = {
        async generate(request: { lenientJson?: boolean; maxAttempts?: number; prompt: string }) {
            requests.push(request);
            return { model: 'fake-model', value: reply(request.prompt) };
        },
    } as unknown as ModelProvider;
    return { provider, requests };
}

function rewriteAll(prompts: Record<string, string>) {
    return () => ({ prompts: Object.entries(prompts).map(([id, prompt]) => ({ id, prompt })) });
}

const BASE = { difficulty: 'easy', languageId: 'go' };

describe('rewritePrompts', () => {
    it('makes one model call for the whole bank and replaces each mc prompt', async () => {
        const questions = [mc('q1', 'Go truncates integer division, so what does this print?'), mc('q2', 'Long q2?')];
        const { provider, requests } = buildProvider(
            rewriteAll({ q1: 'What does this program print?', q2: 'What value is printed?' }),
        );
        const result = await rewritePrompts({ ...BASE, provider, questions });
        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({ lenientJson: true, maxAttempts: 1 });
        expect(result.questions.map((question) => question.prompt)).toEqual([
            'What does this program print?',
            'What value is printed?',
        ]);
        expect(result.rewritten).toBe(2);
    });

    it('changes nothing but the prompt: id, code, choices, answer, and provenance stay identical', async () => {
        const questions = [mc('q1', 'Old prompt that explains the rule?')];
        const { provider } = buildProvider(rewriteAll({ q1: 'What does this program print?' }));
        const result = await rewritePrompts({ ...BASE, provider, questions });
        expect(result.questions[0]).toEqual({ ...questions[0], prompt: 'What does this program print?' });
    });

    it('does not mutate the input questions', async () => {
        const questions = [mc('q1', 'Old prompt?')];
        const snapshot = structuredClone(questions);
        const { provider } = buildProvider(rewriteAll({ q1: 'What does this program print?' }));
        await rewritePrompts({ ...BASE, provider, questions });
        expect(questions).toEqual(snapshot);
    });

    it('never sends the correct choice to the model, and sends the code for context', async () => {
        const questions = [mc('q1', 'Old prompt?', 'UNIQUE-ANSWER-7')];
        const { provider, requests } = buildProvider(rewriteAll({}));
        await rewritePrompts({ ...BASE, provider, questions });
        expect(requests[0]?.prompt).not.toContain('UNIQUE-ANSWER-7');
        expect(requests[0]?.prompt).toContain('q1');
        expect(requests[0]?.prompt).toContain('Old prompt?');
    });

    it('leaves bool cards alone and does not offer them to the model', async () => {
        const questions = [bool('b1', 'Does this print true?'), mc('q1', 'Old?')];
        const { provider, requests } = buildProvider(rewriteAll({ b1: 'Rewritten bool?', q1: 'What is printed?' }));
        const result = await rewritePrompts({ ...BASE, provider, questions });
        expect(requests[0]?.prompt).not.toContain('Does this print true?');
        expect(result.questions[0]).toEqual(questions[0]);
        expect(result.questions[1]?.prompt).toBe('What is printed?');
    });

    it('makes no model call when the bank has no mc card', async () => {
        const questions = [bool('b1', 'Does this print true?')];
        const { provider, requests } = buildProvider(rewriteAll({}));
        const result = await rewritePrompts({ ...BASE, provider, questions });
        expect(requests).toHaveLength(0);
        expect(result).toMatchObject({ questions, rewritten: 0 });
    });

    it.each([
        ['empty', '   '],
        ['longer than 120 characters', `What does this print${'?'.repeat(101)}`],
        ['containing the correct choice', 'Does this print answer-q1 or something else?'],
    ])('keeps the original prompt when the rewrite is %s', async (_label, rewrite) => {
        const questions = [mc('q1', 'Original prompt?')];
        const { provider } = buildProvider(rewriteAll({ q1: rewrite }));
        const result = await rewritePrompts({ ...BASE, provider, questions });
        expect(result.questions[0]?.prompt).toBe('Original prompt?');
        expect(result.rewritten).toBe(0);
    });

    it('accepts a rewrite of exactly 120 characters', async () => {
        const rewrite = `What${'?'.repeat(116)}`;
        expect(rewrite).toHaveLength(120);
        const { provider } = buildProvider(rewriteAll({ q1: rewrite }));
        const result = await rewritePrompts({ ...BASE, provider, questions: [mc('q1', 'Original?')] });
        expect(result.questions[0]?.prompt).toBe(rewrite);
    });

    it('trims surrounding whitespace from an accepted rewrite', async () => {
        const { provider } = buildProvider(rewriteAll({ q1: '  What does this print?  ' }));
        const result = await rewritePrompts({ ...BASE, provider, questions: [mc('q1', 'Original?')] });
        expect(result.questions[0]?.prompt).toBe('What does this print?');
    });

    it('keeps one-character answers from blocking ordinary rewrites', async () => {
        const { provider } = buildProvider(rewriteAll({ q1: 'What number does this print?' }));
        const result = await rewritePrompts({ ...BASE, provider, questions: [mc('q1', 'Original?', '4')] });
        expect(result.questions[0]?.prompt).toBe('What number does this print?');
    });

    it('allows identical neutral prompts across cards, since the code differs', async () => {
        const questions = [mc('q1', 'One?'), mc('q2', 'Two?')];
        const { provider } = buildProvider(
            rewriteAll({ q1: 'What does this program print?', q2: 'What does this program print?' }),
        );
        const result = await rewritePrompts({ ...BASE, provider, questions });
        expect(result.questions.map((question) => question.prompt)).toEqual([
            'What does this program print?',
            'What does this program print?',
        ]);
    });

    it('ignores ids that are unknown or belong to a bool card, and keeps cards the reply omits', async () => {
        const questions = [mc('q1', 'One?'), mc('q2', 'Two?'), bool('b1', 'Bool?')];
        const { provider } = buildProvider(rewriteAll({ ghost: 'Ghost?', b1: 'Hijack?', q2: 'What is printed?' }));
        const result = await rewritePrompts({ ...BASE, provider, questions });
        expect(result.questions.map((question) => question.prompt)).toEqual(['One?', 'What is printed?', 'Bool?']);
        expect(result.questions).toHaveLength(3);
        expect(result.rewritten).toBe(1);
    });

    it('returns the bank unchanged when the reply is malformed', async () => {
        const questions = [mc('q1', 'One?')];
        const { provider } = buildProvider(() => ({ nonsense: true }));
        const result = await rewritePrompts({ ...BASE, provider, questions });
        expect(result).toMatchObject({ questions, rewritten: 0 });
    });
});
