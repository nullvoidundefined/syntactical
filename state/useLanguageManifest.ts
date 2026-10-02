// The manifest the UI renders from: the freshly fetched one when it
// arrived and validated, otherwise the cached or bundled baseline.
import { useQuery } from '@tanstack/react-query';
import type { Manifest } from '../services/content/contentTypes';
import { useContentContext } from './ContentProvider';

export function useLanguageManifest(): Manifest {
  const { baselineManifest } = useContentContext();
  const { data } = useQuery<Manifest | null>({ queryKey: ['manifest'], enabled: false });
  return data ?? baselineManifest;
}
