// Answer events across two questions and one misconception for the review
// state tests: a miss that tags a misconception, then later answers.
import type { AnswerEvent } from '../../types/AnswerEvent.js';

import { buildEvent } from './buildEvent.js';

export const fixtureEvents: AnswerEvent[] = [
    buildEvent({ answeredAt: '2026-09-20T10:00:00Z', choiceIndex: 2, eventId: 'e-1', isCorrect: false, questionId: 'py-easy-01' }),
    buildEvent({ answeredAt: '2026-09-20T10:01:00Z', choiceIndex: 0, eventId: 'e-2', isCorrect: true, questionId: 'py-easy-02' }),
    buildEvent({ answeredAt: '2026-09-21T09:00:00Z', choiceIndex: 1, eventId: 'e-3', isCorrect: true, questionId: 'py-easy-01', roundKind: 'review' }),
    buildEvent({ answeredAt: '2026-09-21T09:00:00Z', choiceIndex: 3, eventId: 'e-4', isCorrect: false, questionId: 'py-easy-02', roundKind: 'review' }),
    buildEvent({ answeredAt: '2026-09-25T09:00:00Z', choiceIndex: 1, eventId: 'e-5', isCorrect: true, questionId: 'py-easy-01', roundKind: 'review' }),
];

const MISCONCEPTION_BY_CHOICE: Record<string, string> = {
    'py-easy-01:2': 'python.mutable-default-args',
    'py-easy-02:3': 'python.is-vs-equals',
};

export function fixtureMisconceptionOf(questionId: string, choiceIndex: number): string | undefined {
    return MISCONCEPTION_BY_CHOICE[`${questionId}:${choiceIndex}`];
}
