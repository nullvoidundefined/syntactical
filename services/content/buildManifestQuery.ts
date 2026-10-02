// The TanStack Query definition for the manifest refresh, disabled when there is no
// content base URL.
import { loadLanguageManifest } from './loadLanguageManifest';

export function buildManifestQuery(contentBaseUrl: string | null, isEnabled: boolean) {
  return {
    enabled: isEnabled && contentBaseUrl !== null,
    queryFn: () =>
      contentBaseUrl === null ? Promise.resolve(null) : loadLanguageManifest(contentBaseUrl),
    queryKey: ['manifest'],
  };
}
