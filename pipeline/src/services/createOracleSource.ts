// Builds the file-backed oracle lookup the CLI hands to validate.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Oracle } from '../types/Oracle.js';
import type { OracleSource } from '../types/OracleSource.js';

type OracleMap = Record<string, Oracle>;

// Reads oracles from `<oraclesDir>/<bankKey>.json`, a map of question id to oracle.
// A missing file or id means the question has no oracle.
export function createOracleSource(oraclesDir: string): OracleSource {
    const cache = new Map<string, Promise<OracleMap>>();
    async function loadBank(bankKey: string): Promise<OracleMap> {
        try {
            return JSON.parse(await readFile(join(oraclesDir, `${bankKey}.json`), 'utf8')) as OracleMap;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return {};
            }
            throw error;
        }
    }
    return async function oracleFor(bankKey, questionId) {
        const cached = cache.get(bankKey) ?? loadBank(bankKey);
        cache.set(bankKey, cached);
        return (await cached)[questionId] ?? null;
    };
}
