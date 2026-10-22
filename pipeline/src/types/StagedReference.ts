// A question's reference as staged by `write-references`: a neutral title and documentation links,
// shown before an answer, and the syntax reference, shown after. `apply-staging` copies them into
// the query, keeping only the links `verify-doc-links` confirmed.
import type { DocLink } from '@syntactical/content-schema';

export interface StagedReference {
    docs: DocLink[];
    syntax: string;
    title: string;
}
