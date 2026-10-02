// A manifest entry for one language and the banks it offers per difficulty.
import type { DifficultyId, Grammar } from '../../../constants/appConfig';

import type { BankEntry } from './BankEntry';

export type LanguageEntry = {
  id: string;
  label: string;
  glyph: string;
  tagline: string;
  grammar: Grammar;
  banks: Partial<Record<DifficultyId, BankEntry>>;
};
