// Builds one answer event for the progress tests: a correct easy bank answer
// unless the overrides say otherwise.
import type { AnswerEvent } from '../../types/AnswerEvent.js';

export function buildEvent(overrides: Partial<AnswerEvent> = {}): AnswerEvent {
    return {
        answeredAt: '2026-10-02T12:00:00Z',
        bankKey: 'python/easy',
        choiceIndex: 0,
        eventId: 'event-1',
        isCorrect: true,
        questionId: 'question-1',
        roundKind: 'bank',
        ...overrides,
    };
}
