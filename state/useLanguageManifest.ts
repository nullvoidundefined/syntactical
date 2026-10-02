// The manifest the UI renders from: the freshly fetched one when it
// arrived and validated, otherwise the cached or bundled baseline.
import { useQuery } from '@tanstack/react-query';

import { buildManifestQuery } from '../services/content/buildManifestQuery';
import type { Manifest } from '../services/content/types/Manifest';

import { useContentContext } from './ContentProvider';

export function useLanguageManifest(): Manifest {
  const { baselineManifest, contentBaseUrl } = useContentContext();
  const { data } = useQuery(buildManifestQuery(contentBaseUrl, false));
  return data ?? baselineManifest;
}
