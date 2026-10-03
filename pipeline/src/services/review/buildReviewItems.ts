// Builds one bank's review items, merged by question id. An item is here because it is in
// the review queue, was generated, is enriched, did not pass validation (or has no
// verdict), or was drawn into the deterministic sample of executed questions.
import type { Question } from '@syntactical/content-schema';

import type { ReviewBankInputs } from '../../types/review/ReviewBankInputs.js';
import type { ReviewItem } from '../../types/review/ReviewItem.js';

import { isSafeItemId } from './isSafeItemId.js';
import { pickSample } from './pickSample.js';

interface BuildReviewItemsArgs {
    bank: Question[];
    bankKey: string;
    inputs: ReviewBankInputs;
    log: (line: string) => void;
    observe: (bankKey: string, question: Question) => Promise<string | undefined>;
    // Validation verdict per question id, from pipeline/reports/latest.json.
    statuses: Map<string, string>;
}

const PASSED = 'passed';

export async function buildReviewItems(args: BuildReviewItemsArgs): Promise<ReviewItem[]> {
    const { bank, bankKey, inputs, log, observe, statuses } = args;
    const { classifications, enrichment, generated, queue } = inputs;
    const questions = new Map<string, Question>();
    const kinds = new Map<string, string[]>();
    const tag = (id: string, kind: string): void => {
        kinds.set(id, [...(kinds.get(id) ?? []), kind]);
    };
    const proposed = new Map<string, string>();
    for (const question of bank) {
        const { id } = question;
        if (!isSafeItemId(id)) {
            log(`${bankKey}: skipped a question with an unsafe id`);
            continue;
        }
        questions.set(id, question);
        const status = statuses.get(id);
        if (status !== PASSED) {
            tag(id, `validation ${status ?? 'missing'}`);
        }
    }
    for (const question of generated) {
        questions.set(question.id, question);
        tag(question.id, 'generated');
    }
    for (const { id, reason, suggestedTopic } of queue) {
        tag(id, `review-queue (${reason ?? 'no reason'})`);
        if (suggestedTopic !== undefined) {
            proposed.set(id, suggestedTopic);
        }
    }
    for (const id of Object.keys(enrichment)) {
        tag(id, 'enrichment awaiting approval');
    }
    const executed = [...questions.keys()].filter((id) => statuses.get(id) === PASSED && bank.some((q) => q.id === id));
    for (const id of pickSample(bankKey, executed)) {
        tag(id, 'sample of executed questions');
    }
    const items: ReviewItem[] = [];
    for (const [id, itemKinds] of [...kinds.entries()].sort(([left], [right]) => (left < right ? -1 : 1))) {
        const question = questions.get(id);
        const observed = question === undefined ? undefined : await observe(bankKey, question);
        const { provenance, topic: ownTopic } = question ?? ({} as Partial<Question>);
        const topic = proposed.get(id) ?? classifications[id]?.topic ?? ownTopic;
        const rationales = Object.hasOwn(enrichment, id) ? enrichment[id] : undefined;
        items.push({
            id,
            kinds: itemKinds,
            ...(observed === undefined ? {} : { observed }),
            ...(topic === undefined ? {} : { proposedTopic: topic }),
            ...(question === undefined ? {} : { question }),
            ...(rationales === undefined ? {} : { rationales }),
            status: statuses.get(id) ?? provenance?.validation.status ?? 'unknown',
        });
    }
    return items;
}
