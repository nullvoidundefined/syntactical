// Copies a staged reference into a question's query: the neutral title and the syntax reference
// replace the old ones, and the documentation links become the query's `docs`, keeping only links
// `verify-doc-links` confirmed. With no confirmed link the query carries no `docs`. The query is
// marked `isSyntaxAfterAnswer` exactly when the staged reference is.
import type { Question } from '@syntactical/content-schema';

import type { StagedReference } from '../../types/StagedReference.js';

import type { DocLinkChecks } from './readDocLinkChecks.js';

export function applyReference(question: Question, reference: StagedReference, checks: DocLinkChecks): Question {
    const { docs: staged, isSyntaxAfterAnswer, syntax, title } = reference;
    const { docs: _oldDocs, isSyntaxAfterAnswer: _oldFlag, ...query } = question.query;
    const docs = staged.filter(({ url }) => checks.get(url)?.ok === true);
    return {
        ...question,
        query: {
            ...query,
            syntax,
            title,
            ...(docs.length === 0 ? {} : { docs }),
            ...(isSyntaxAfterAnswer === true ? { isSyntaxAfterAnswer } : {}),
        },
    };
}
