// What the content provider hands to consumers: where content lives, the
// baseline manifest, and a reader for locally available banks.
import type { CachedBank } from './CachedBank';
import type { Manifest } from './Manifest';

export type ContentAccess = {
  baselineManifest: Manifest;
  contentBaseUrl: string;
  readLocalBank: (language: string, difficulty: string) => CachedBank | null;
};
