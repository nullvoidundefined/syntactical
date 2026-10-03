// Builds the file-backed oracle lookup the CLI hands to validate.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Oracle } from '../types/Oracle.js';
import type { OracleSource } from '../types/OracleSource.js';

type OracleMap = Record<string, Oracle>;

// Reads oracles from `<oraclesDir>/<bankKey>.json`, a map of question id to oracle.
// A missing file or id means the question has no oracle; a malformed file throws.
export function createOracleSource(oraclesDir: string): OracleSource {
    const cache = new Map<string, Promise<OracleMap>>();
    async function loadBank(bankKey: string): Promise<OracleMap> {
        const file = join(oraclesDir, `${bankKey}.json`);
        let text: string;
        try {
            text = await readFile(file, 'utf8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return {};
            }
            throw error;
        }
        try {
            return JSON.parse(text) as OracleMap;
        } catch (error) {
            throw new Error(`Malformed oracle file for bank "${bankKey}" (${file}): ${String(error)}`, {
                cause: error,
            });
        }
    }
    return async function oracleFor(bankKey, questionId) {
        let pending = cache.get(bankKey);
        if (!pending) {
            pending = loadBank(bankKey);
            cache.set(bankKey, pending);
            // A failed load must not stay cached, or every later lookup replays it.
            pending.catch(() => cache.delete(bankKey));
        }
        const bank = await pending;
        return Object.hasOwn(bank, questionId) ? (bank[questionId] ?? null) : null;
    };
}
