// A manifest entry for one language or topic track: its topics, misconceptions, and banks per difficulty.
import type { DifficultyId } from '../difficulties.js';
import type { EntryKind } from '../entryKinds.js';
import type { Grammar } from '../grammars.js';

import type { BankEntry } from './BankEntry.js';

export type LanguageEntry = {
  id: string;
  kind?: EntryKind;
  label: string;
  glyph: string;
  tagline: string;
  grammar: Grammar;
  topics: { id: string; label: string }[];
  misconceptions: { id: string; description: string }[];
  banks: Partial<Record<DifficultyId, BankEntry>>;
};
