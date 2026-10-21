// The runner ids, one per pipeline/runners/<id> directory and golden/<id>.json file. Every
// list of runners (the Docker language check, the oracle file schema, the tests) reads this one.
export const ORACLE_LANGUAGE_IDS = [
    'python',
    'node',
    'postgres',
    'ruby',
    'rails',
    'go',
    'jsdom',
    'typescript',
] as const;

export type OracleLanguage = (typeof ORACLE_LANGUAGE_IDS)[number];
