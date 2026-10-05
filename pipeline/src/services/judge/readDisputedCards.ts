// Reads `disputed/<language>/<difficulty>.json`: the cards the judged route could not settle.
// A missing file is empty; a file of the wrong shape throws, so it is never overwritten blindly.
import { z } from 'zod';

import type { DisputedCard } from '../../types/judge/DisputedCard.js';
import { readJsonIfPresent } from '../gapFill/readJsonIfPresent.js';

const SCHEMA = z.looseObject({
    cards: z.array(
        z.looseObject({
            blindAnswers: z.strictObject({ claude: z.number().int().nullable(), codex: z.number().int().nullable() }),
            claimedIndex: z.number().int(),
            consistency: z.strictObject({ isConsistent: z.boolean(), reason: z.string() }).nullable(),
            failure: z.enum(['blind-disagreement', 'inconsistent']),
            question: z.looseObject({ id: z.string(), prompt: z.string() }),
        }),
    ),
});

export async function readDisputedCards(file: string): Promise<DisputedCard[]> {
    const raw = await readJsonIfPresent(file);
    return raw === undefined ? [] : (SCHEMA.parse(raw).cards as unknown as DisputedCard[]);
}
