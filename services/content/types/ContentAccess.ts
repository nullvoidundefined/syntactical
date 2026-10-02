// What the content provider hands to consumers: where content lives (null when no
// trusted base URL exists, which disables fetching), the
// baseline manifest, and a reader for locally available banks.
import type { CachedBank } from './CachedBank';
import type { Manifest } from './Manifest';

export type ContentAccess = {
  baselineManifest: Manifest;
  contentBaseUrl: string | null;
  readLocalBank: (language: string, difficulty: string) => CachedBank | null;
};
