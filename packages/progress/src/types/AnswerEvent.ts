// One answered question, recorded append-only; the unit of sync.
export type AnswerEvent = {
    answeredAt: string;
    bankKey: string;
    choiceIndex: number;
    eventId: string;
    isCorrect: boolean;
    questionId: string;
    roundKind: 'bank' | 'review' | 'topic';
};
