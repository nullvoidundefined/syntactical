// One-time converter from a schema 1 manifest to schema 2.

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function convertBank(languageId: unknown, difficulty: string, bank: unknown): JsonObject {
    if (!isObject(bank)) {
        throw new Error('Bank entry is not an object');
    }
    const isFree = difficulty === 'easy';
    return {
        path: bank.path,
        hash: bank.hash,
        access: isFree ? 'free' : 'paid',
        ...(isFree ? {} : { productId: `syntactical.${String(languageId)}.${difficulty}` }),
        contentVersion: 1,
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
        topics: [],
        misconceptions: [],
        banks: Object.fromEntries(
            Object.entries(language.banks).map(([difficulty, bank]) => [
                difficulty,
                convertBank(language.id, difficulty, bank),
            ]),
        ),
    };
}

export function migrateManifestV1(manifest: unknown): unknown {
    if (!isObject(manifest) || manifest.schemaVersion !== 1 || !Array.isArray(manifest.languages)) {
        throw new Error('Not a schema 1 manifest');
    }
    return { ...manifest, schemaVersion: 2, languages: manifest.languages.map(convertLanguage) };
}
