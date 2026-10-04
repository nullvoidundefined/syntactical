// Reads an existing `<language>/<difficulty>.json` oracle file as a Map of question id
// to oracle. A missing file is an empty Map. A file that is not a plain object of
// oracle-shaped values stops the run with a message naming the file, so it is never
// overwritten or merged into blindly.
import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import type { Oracle } from '../types/Oracle.js';

import { sanitizeLogText } from './sanitizeLogText.js';

const oracleSchema = z.strictObject({
    choiceCode: z.array(z.string()).optional(),
    code: z.string(),
    language: z.enum(['python', 'node', 'postgres', 'ruby', 'rails']),
    setupSql: z.string().optional(),
});

function invalid(file: string, reason: string): Error {
    return new Error(`Existing oracle file ${file} is not valid: ${sanitizeLogText(reason)}`);
}

export async function readExistingOracles(file: string): Promise<Map<string, Oracle>> {
    let text: string;
    try {
        text = await readFile(file, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return new Map();
        }
        throw error;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        throw invalid(file, `not JSON (${String(error)})`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw invalid(file, 'expected an object of question id to oracle');
    }
    const oracles = new Map<string, Oracle>();
    for (const [id, value] of Object.entries(parsed)) {
        const { data, error, success } = oracleSchema.safeParse(value);
        if (!success) {
            throw invalid(file, `entry "${id}" is not an oracle (${error.issues[0]?.message ?? 'unknown'})`);
        }
        oracles.set(id, data);
    }
    return oracles;
}
