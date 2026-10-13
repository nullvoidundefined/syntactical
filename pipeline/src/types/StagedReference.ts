// A question's before-answer reference as staged by `write-references`: a neutral title, the
// syntax reference, and documentation links. Publish copies the title and syntax into the query
// and only the links `verify-doc-links` confirmed.
import type { DocLink } from '@syntactical/content-schema';

export interface StagedReference {
    docs: DocLink[];
    syntax: string;
    title: string;
}
