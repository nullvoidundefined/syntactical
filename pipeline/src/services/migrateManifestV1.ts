// One-time converter from a schema 1 manifest to schema 2.

const SCHEMA_VERSION_1 = 1;
const SCHEMA_VERSION_2 = 2;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function convertBank(languageId: unknown, difficulty: string, bank: unknown): JsonObject {
    if (!isObject(bank)) {
        throw new Error('Bank entry is not an object');
    }
    const isFree = difficulty === 'easy';
    const { hash, path } = bank;
    return {
        access: isFree ? 'free' : 'paid',
        contentVersion: 1,
        hash,
        path,
        ...(isFree ? {} : { productId: `syntactical.${String(languageId)}.${difficulty}` }),
        topicCounts: {},
    };
}

function convertLanguage(language: unknown): JsonObject {
    if (!isObject(language) || !isObject(language.banks)) {
        throw new Error('Language entry is malformed');
    }
    const { banks, ...rest } = structuredClone(language);
    return {
        ...rest,
        banks: Object.fromEntries(
            Object.entries(language.banks).map(([difficulty, bank]) => [
                difficulty,
                convertBank(language.id, difficulty, bank),
            ]),
        ),
        misconceptions: [],
        topics: [],
    };
}

export function migrateManifestV1(manifest: unknown): unknown {
    if (!isObject(manifest)) {
        throw new Error('Not a schema 1 manifest');
    }
    const { languages, schemaVersion } = manifest;
    if (schemaVersion !== SCHEMA_VERSION_1 || !Array.isArray(languages)) {
        throw new Error('Not a schema 1 manifest');
    }
    return { ...manifest, languages: languages.map(convertLanguage), schemaVersion: SCHEMA_VERSION_2 };
}
