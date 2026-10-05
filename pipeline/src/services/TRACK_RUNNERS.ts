// Maps a topic track id to the runners its questions may choose from. A draft whose oracle
// names any other runner is dropped. Language tracks are not listed: they use ORACLE_LANGUAGES.
import type { OracleLanguage } from '../types/OracleLanguage.js';

export const TRACK_RUNNERS: Record<string, readonly OracleLanguage[]> = {
    'backend-security': ['python', 'node', 'postgres'],
    'frontend-security': ['jsdom', 'node'],
};
