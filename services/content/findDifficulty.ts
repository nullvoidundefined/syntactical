// The difficulty registry entry for one id, if it is a known difficulty.
import { DIFFICULTIES } from '@syntactical/content-schema';

export type DifficultyEntry = (typeof DIFFICULTIES)[number];

export function findDifficulty(difficulty: string): DifficultyEntry | undefined {
  return DIFFICULTIES.find(({ id }) => id === difficulty);
}
