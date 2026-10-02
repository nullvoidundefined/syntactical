// One-time converter from a schema 1 question bank to schema 2.

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function convertQuestion(question: unknown): unknown {
    if (!isObject(question)) {
        throw new Error('Question is not an object');
    }
    const converted: JsonObject = { ...structuredClone(question) };
    if (question.type === 'mc' && Array.isArray(question.choices)) {
        converted.choices = question.choices.map((choice) => ({ text: choice }));
    }
    converted.provenance = {
        source: 'original',
        validation: { method: 'judged', status: 'pending' },
        isHumanReviewed: false,
    };
    return converted;
}

export function migrateBankV1(bank: unknown): { schemaVersion: 2; questions: unknown[] } {
    if (!isObject(bank) || bank.schemaVersion !== 1 || !Array.isArray(bank.questions)) {
        throw new Error('Not a schema 1 question bank');
    }
    return { schemaVersion: 2, questions: bank.questions.map(convertQuestion) };
}
