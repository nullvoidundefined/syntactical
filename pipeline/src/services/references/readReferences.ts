// Reads a bank's reference staging file (question id to reference) so a rerun skips questions it
// already wrote. Missing file: an empty map. A file that does not parse throws, so a bad file is
// never silently replaced.
import { z } from 'zod';

import type { StagedReference } from '../../types/StagedReference.js';
import { readJsonIfPresent } from '../gapFill/readJsonIfPresent.js';

import { REFERENCE_SCHEMA } from './REFERENCE_SCHEMA.js';

const SCHEMA = z.record(z.string(), REFERENCE_SCHEMA.extend({ isSyntaxAfterAnswer: z.boolean().optional() }));

export async function readReferences(file: string): Promise<Map<string, StagedReference>> {
    const value = await readJsonIfPresent(file);
    return value === undefined ? new Map() : new Map(Object.entries(SCHEMA.parse(value)));
}
