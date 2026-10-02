// The validated content manifest: schema version and the language entries.
import type { LanguageEntry } from './LanguageEntry.js';

export type Manifest = { schemaVersion: number; languages: LanguageEntry[] };
