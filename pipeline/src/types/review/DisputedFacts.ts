// Review displays the judge's facts separately from the question itself.
import type { EvidenceSource } from '@syntactical/content-schema';
import type { DisputedCard } from '../judge/DisputedCard.js';
export type DisputedFacts = Omit<DisputedCard, 'question'> & { sources: EvidenceSource[] };
