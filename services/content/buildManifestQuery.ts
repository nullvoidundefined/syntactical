// The TanStack Query definition for the manifest refresh.
import { loadLanguageManifest } from './loadLanguageManifest';

export function buildManifestQuery(contentBaseUrl: string, isEnabled: boolean) {
  return {
    enabled: isEnabled,
    queryFn: () => loadLanguageManifest(contentBaseUrl),
    queryKey: ['manifest'],
  };
}
