// Copies a staged reference into a question's query: the neutral title and the syntax reference
// replace the old ones, and the documentation links become the query's `docs`, keeping only links
// `verify-doc-links` confirmed. With no confirmed link the query carries no `docs`.
import type { Question } from '@syntactical/content-schema';

import type { StagedReference } from '../../types/StagedReference.js';

import type { DocLinkChecks } from './readDocLinkChecks.js';

export function applyReference(question: Question, reference: StagedReference, checks: DocLinkChecks): Question {
    const { docs: staged, syntax, title } = reference;
    const { docs: _old, ...query } = question.query;
    const docs = staged.filter(({ url }) => checks.get(url)?.ok === true);
    return { ...question, query: { ...query, syntax, title, ...(docs.length === 0 ? {} : { docs }) } };
}
