// Maps a content language id to the language its oracle runs in. A language not listed
// here has no oracle runner.
import type { OracleLanguage } from '../types/OracleLanguage.js';

export const ORACLE_LANGUAGES: Record<string, OracleLanguage> = {
    go: 'go',
    javascript: 'node',
    postgres: 'postgres',
    python: 'python',
    rails: 'rails',
    ruby: 'ruby',
};
