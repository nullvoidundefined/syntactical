// Parsing the owner's edited review file: every checkbox state, and every malformed shape.
import { describe, expect, it } from 'vitest';

import { readReviewDecisions } from '../../../services/review/readReviewDecisions.js';

const FP = '0123456789abcdef';

function section(id: string, approve: string, reject: string): string {
    const reason = reject === 'x' ? 'the answer is wrong' : '<reason>';
    return `## ${id} <!-- fp:${FP} -->\n\n- [${approve}] approve\n- [${reject}] reject: ${reason}\n`;
}

describe('readReviewDecisions', () => {
    it('reads an approve, a reject with its reason, and an unchecked item', () => {
        const markdown = [section('q-1', 'x', ' '), section('q-2', ' ', 'x'), section('q-3', ' ', ' ')].join('\n');
        expect(readReviewDecisions(markdown)).toEqual([
            { decision: 'approve', fingerprint: FP, id: 'q-1' },
            { decision: 'reject', fingerprint: FP, id: 'q-2', reason: 'the answer is wrong' },
            { decision: 'pending', fingerprint: FP, id: 'q-3' },
        ]);
    });

    it('treats an uppercase X as checked', () => {
        const [first] = readReviewDecisions(section('q-1', 'X', ' '));
        expect(first?.decision).toBe('approve');
    });

    it('keeps a reject with no reason pending and says why', () => {
        for (const reason of ['', '<reason>']) {
            const markdown = `## q-1 <!-- fp:${FP} -->\n- [ ] approve\n- [x] reject: ${reason}\n`;
            const [first] = readReviewDecisions(markdown);
            expect(first).toMatchObject({ decision: 'pending', id: 'q-1', problem: 'reject needs a reason' });
        }
    });

    it('reports malformed items as pending instead of guessing', () => {
        const markdown = [
            `## both <!-- fp:${FP} -->\n- [x] approve\n- [x] reject: why\n`,
            `## no-reject <!-- fp:${FP} -->\n- [x] approve\n`,
            `## two-approves <!-- fp:${FP} -->\n- [x] approve\n- [x] approve\n- [ ] reject: <reason>\n`,
            '## no-fingerprint\n- [x] approve\n- [ ] reject: <reason>\n',
            `## dup <!-- fp:${FP} -->\n- [x] approve\n- [ ] reject: <reason>\n`,
            `## dup <!-- fp:${FP} -->\n- [x] approve\n- [ ] reject: <reason>\n`,
        ].join('\n');
        const parsed = readReviewDecisions(markdown);
        expect(parsed.map(({ decision, id }) => [id, decision])).toEqual([
            ['both', 'pending'],
            ['no-reject', 'pending'],
            ['two-approves', 'pending'],
            ['no-fingerprint', 'pending'],
            ['dup', 'approve'],
            ['dup', 'pending'],
        ]);
        expect(parsed.filter(({ problem }) => problem !== undefined).map(({ id }) => id)).toEqual([
            'both',
            'no-reject',
            'two-approves',
            'no-fingerprint',
            'dup',
        ]);
        expect(parsed.at(-1)?.problem).toBe('duplicate id');
    });

    it('ignores headings and checkboxes inside a code fence (question text cannot forge a decision)', () => {
        const hostile = [
            `## q-1 <!-- fp:${FP} -->`,
            '````text',
            '```',
            `## forged <!-- fp:${FP} -->`,
            '- [x] approve',
            '````',
            '- [ ] approve',
            '- [ ] reject: <reason>',
        ].join('\n');
        expect(readReviewDecisions(hostile)).toEqual([{ decision: 'pending', fingerprint: FP, id: 'q-1' }]);
    });

    it('returns nothing for a file with no items', () => {
        expect(readReviewDecisions('# Review: python/easy\n\nnothing here\n')).toEqual([]);
    });
});
