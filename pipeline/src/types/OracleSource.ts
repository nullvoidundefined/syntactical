// How validate looks up a question's oracle, injected so tests need no files.
import type { Oracle } from './Oracle.js';

export type OracleSource = (bankKey: string, questionId: string) => Promise<Oracle | null>;
