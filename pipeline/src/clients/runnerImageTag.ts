import type { OracleLanguage } from '../types/OracleLanguage.js';

export function runnerImageTag(language: OracleLanguage): string {
    return `syntactical-runner-${language}:1`;
}
