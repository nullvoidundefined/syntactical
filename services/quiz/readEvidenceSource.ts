// The source a judged card shows in its query drawer: the first cited source, only when its
// title is not blank and its URL is https. Executed cards show none.
import type { EvidenceSource, Question } from '@syntactical/content-schema';

export function readEvidenceSource(question: Question): EvidenceSource | undefined {
  const { evidence, method } = question.provenance.validation;
  if (method !== 'judged') return undefined;
  const first = evidence?.sources[0];
  if (!first || first.title.trim() === '' || !first.url.startsWith('https://')) return undefined;
  return first;
}
