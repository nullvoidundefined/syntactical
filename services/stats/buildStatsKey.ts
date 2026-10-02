// The key under which one language and difficulty pair is tracked.
import type { RoundKey } from './types/RoundKey';

export function buildStatsKey({ difficulty, language }: RoundKey): string {
  return `${language}:${difficulty}`;
}
