// A question bank stored together with the hash it was verified against.
import type { Question } from './Question';

export type CachedBank = { hash: string; questions: Question[] };
