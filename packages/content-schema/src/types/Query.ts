import type { DocLink } from './DocLink.js';

// A question's reference card: title, explanation, and optional syntax, tags, and documentation
// links. The title, syntax, and docs are shown before the learner answers, so they must not give
// the answer away; the explanation and tags are shown only after.
export type Query = { title: string; explanation: string; syntax?: string; tags?: string[]; docs?: DocLink[] };
