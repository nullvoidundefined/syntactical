// Manifest fixtures for the command tests: a placeholder bank hash, a bank
// entry, a language entry with every required field defaulted, and the
// manifest envelope. Callers override only the fields a test is about.
export const HASH = '0123456789abcdef'.repeat(4);

type Entry = Record<string, unknown>;

export function buildBankEntry(path: string, access: 'free' | 'paid' = 'free', productId?: string): Entry {
    return {
        access,
        contentVersion: 1,
        hash: HASH,
        path,
        topicCounts: {},
        ...(productId === undefined ? {} : { productId }),
    };
}

export function buildLanguage(overrides: Entry = {}): Entry {
    return {
        banks: {},
        glyph: 'G',
        grammar: 'plain',
        id: 'python',
        label: 'L',
        misconceptions: [],
        tagline: 'T',
        topics: [],
        ...overrides,
    };
}

export function buildManifest(...languages: Entry[]): Entry {
    return { languages, schemaVersion: 2 };
}
