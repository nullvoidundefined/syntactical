// The "Source: <title>" link under a judged card's query.
import type { EvidenceSource } from '@syntactical/content-schema';

import { ExternalLink } from './ExternalLink';

export function SourceLink({ source }: { source: EvidenceSource }) {
  const { title, url } = source;
  return <ExternalLink className="mt-6" label={`Source: ${title}`} url={url} />;
}
