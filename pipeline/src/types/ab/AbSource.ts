// The language an A/B card's two options are written in, and the fixture SQL (Postgres only)
// they run against.
import type { Oracle } from '../Oracle.js';

export type AbSource = Pick<Oracle, 'language' | 'setupSql'>;
