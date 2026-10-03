// The ids a language's banks may reference at publish time: its closed topic list (the manifest's,
// or `pipeline/topics.json` for a language whose manifest lists none) and its misconceptions (the
// manifest's plus the approved taxonomy, which the manifest build copies in after publish).
import type { LanguageEntry } from '@syntactical/content-schema';

import type { TaxonomyEntry } from '../../types/TaxonomyEntry.js';
import { pickTopics } from '../classify/pickTopics.js';

export function buildPublishContext(
    language: LanguageEntry,
    taxonomy: TaxonomyEntry[],
    fallbackTopics: string[] | undefined,
): { misconceptionIds: string[]; topicIds: string[] } {
    const { misconceptions, topics } = language;
    return {
        misconceptionIds: [...misconceptions, ...taxonomy].map(({ id }) => id),
        topicIds: pickTopics(topics, fallbackTopics),
    };
}
