// Turns a manifest language entry into the BankContext the bank validators take.
import type { BankContext } from './types/BankContext.js';
import type { LanguageEntry } from './types/LanguageEntry.js';

export function buildBankContext(language: LanguageEntry): BankContext {
  return {
    topicIds: language.topics.map((topic) => topic.id),
    misconceptionIds: language.misconceptions.map((misconception) => misconception.id),
  };
}
