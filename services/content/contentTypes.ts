// Shapes of the fetched manifest and question banks after validation.
import type { DifficultyId, Grammar } from '../../constants/appConfig';

export type Query = { title: string; explanation: string; syntax?: string; tags?: string[] };
type QuestionBase = { id: string; prompt: string; code?: string; query: Query };
export type Question =
  | (QuestionBase & { type: 'mc'; choices: string[]; answerIndex: number })
  | (QuestionBase & { type: 'bool'; answer: boolean });
export type BankEntry = { path: string; hash: string };
export type LanguageEntry = {
  id: string;
  label: string;
  glyph: string;
  tagline: string;
  grammar: Grammar;
  banks: Partial<Record<DifficultyId, BankEntry>>;
};
export type Manifest = { schemaVersion: number; languages: LanguageEntry[] };
