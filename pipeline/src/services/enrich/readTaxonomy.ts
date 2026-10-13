// Reads a language's APPROVED taxonomy, `<pipelineDir>/taxonomy/<language>.json`: a bare
// array of { id, description }. The draft file is never read. Missing or empty: null, so
// the caller skips the language. A file that exists but breaks the schema's misconception
// rules throws, so a bad list never reaches a prompt.
import { join } from 'node:path';

import { findMisconceptionsProblem } from '@syntactical/content-schema';
import { z } from 'zod';

import type { TaxonomyEntry } from '../../types/TaxonomyEntry.js';
import { readJsonIfPresent } from '../json/readJsonIfPresent.js';
import { sanitizeLogText } from '../sanitizeLogText.js';

const SCHEMA = z.array(z.object({ description: z.string(), id: z.string() }));

export async function readTaxonomy(pipelineDir: string, language: string): Promise<TaxonomyEntry[] | null> {
    const raw = await readJsonIfPresent(join(pipelineDir, 'taxonomy', `${language}.json`));
    if (raw === undefined) {
        return null;
    }
    const taxonomy = SCHEMA.parse(raw);
    const problem = findMisconceptionsProblem(taxonomy, language);
    if (problem !== null) {
        throw new Error(`taxonomy-invalid: ${sanitizeLogText(problem)}`);
    }
    return taxonomy.length > 0 ? taxonomy : null;
}
