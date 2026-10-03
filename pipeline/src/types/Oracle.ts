import type { OracleLanguage } from './OracleLanguage.js';

export interface Oracle {
    language: OracleLanguage;
    code: string;
    setupSql?: string;
    choiceCode?: string[];
}
