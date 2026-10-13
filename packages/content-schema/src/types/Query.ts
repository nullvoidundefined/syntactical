import type { DocLink } from './DocLink.js';

// A question's reference card: title, explanation, and optional syntax, tags, and documentation
// links. The title, syntax, and docs are shown before the learner answers, so they must not give
// the answer away; the explanation and tags are shown only after. `isSyntaxAfterAnswer` holds the
// syntax back until after an answer too, for a question that asks what a feature does, where any
// useful syntax reference states the answer.
export type Query = {
  title: string;
  explanation: string;
  syntax?: string;
  tags?: string[];
  docs?: DocLink[];
  isSyntaxAfterAnswer?: boolean;
};
