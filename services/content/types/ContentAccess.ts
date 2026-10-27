// What the content provider hands to consumers: where content lives (null when no
// trusted base URL exists, which disables fetching), the baseline manifest, a reader
// for locally available banks, and whether the on-device cache has been read yet.
// Until it has, the baseline is the bundled manifest and only bundled banks are local.
import type { CachedBank, Manifest } from '@syntactical/content-schema';

export type ContentAccess = {
  baselineManifest: Manifest;
  contentBaseUrl: string | null;
  isHydrated: boolean;
  readLocalBank: (language: string, difficulty: string) => CachedBank | null;
};
