// The two kinds of manifest entry: a language track or a topic track. A missing kind means 'language'.
export const ENTRY_KINDS = ['language', 'topic'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];
