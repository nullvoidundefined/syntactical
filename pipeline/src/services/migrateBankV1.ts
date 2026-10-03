// One-time converter from a schema 1 question bank to schema 2.

const SCHEMA_VERSION_1 = 1;
const SCHEMA_VERSION_2 = 2;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function convertQuestion(question: unknown): unknown {
    if (!isObject(question)) {
        throw new Error('Question is not an object');
    }
    const converted: JsonObject = { ...structuredClone(question) };
    const { choices, type } = question;
    if (type === 'mc' && Array.isArray(choices)) {
        converted.choices = choices.map((choice) => ({ text: choice }));
    }
    converted.provenance = {
        isHumanReviewed: false,
        source: 'original',
        validation: { method: 'judged', status: 'pending' },
    };
    return converted;
}

export function migrateBankV1(bank: unknown): { questions: unknown[]; schemaVersion: typeof SCHEMA_VERSION_2 } {
    if (!isObject(bank)) {
        throw new Error('Not a schema 1 question bank');
    }
    const { questions, schemaVersion } = bank;
    if (schemaVersion !== SCHEMA_VERSION_1 || !Array.isArray(questions)) {
        throw new Error('Not a schema 1 question bank');
    }
    return { questions: questions.map(convertQuestion), schemaVersion: SCHEMA_VERSION_2 };
}
