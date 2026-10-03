// Reads a language's APPROVED taxonomy, `<pipelineDir>/taxonomy/<language>.json`: a bare
// array of { id, description }. The draft file is never read. Missing or empty: null, so
// the caller skips the language. A file that exists but breaks the schema's misconception
// rules throws, so a bad list never reaches a prompt.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { findMisconceptionsProblem } from '@syntactical/content-schema';
import { z } from 'zod';

import type { TaxonomyEntry } from '../../types/TaxonomyEntry.js';
import { sanitizeLogText } from '../sanitizeLogText.js';

const SCHEMA = z.array(z.object({ description: z.string(), id: z.string() }));

export async function readTaxonomy(pipelineDir: string, language: string): Promise<TaxonomyEntry[] | null> {
    let text: string;
    try {
        text = await readFile(join(pipelineDir, 'taxonomy', `${language}.json`), 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    }
    const taxonomy = SCHEMA.parse(JSON.parse(text));
    const problem = findMisconceptionsProblem(taxonomy, language);
    if (problem !== null) {
        throw new Error(`taxonomy-invalid: ${sanitizeLogText(problem)}`);
    }
    return taxonomy.length > 0 ? taxonomy : null;
}
