// What backs a judged question: the verified sources and the consistency verdict.
import type { EvidenceSource } from './EvidenceSource.js';

export type Evidence = { sources: EvidenceSource[]; verdict: string };
