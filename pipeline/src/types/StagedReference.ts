// A question's before-answer reference as staged by `write-references`: a neutral title, the
// syntax reference, and documentation links, plus whether the syntax waits until after an answer
// (a question that asks what a feature does). `apply-staging` copies them into the query, keeping
// only the links `verify-doc-links` confirmed.
import type { DocLink } from '@syntactical/content-schema';

export interface StagedReference {
    docs: DocLink[];
    isSyntaxAfterAnswer?: boolean;
    syntax: string;
    title: string;
}
