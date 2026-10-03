import { describe, expect, it } from 'vitest';

import { validateQuestionBank } from '../validateQuestionBank.js';

// No fixture here carries a topic or misconceptionId, so the context lists none.
const CONTEXT = { topicIds: [], misconceptionIds: [] };

const query = { explanation: 'Explanation', title: 'Title' };
const provenance = { isHumanReviewed: false, source: 'original', validation: { method: 'executed', status: 'passed' } };
const validQuestion = { answer: true, id: 'q-valid', prompt: 'True?', provenance, query, type: 'bool' };

describe('validateQuestionBank empty tag', () => {
  it('drops a question whose tags include an empty string and keeps the rest', () => {
    const emptyTagQuestion = { ...validQuestion, id: 'q-empty-tag', query: { ...query, tags: [''] } };
    const result = validateQuestionBank({ questions: [validQuestion, emptyTagQuestion], schemaVersion: 2 }, CONTEXT);
    expect(result).toEqual({
      dropped: [{ id: 'q-empty-tag', rule: 'malformed question' }],
      droppedQuestionIds: ['q-empty-tag'],
      isValid: true,
      questions: [validQuestion],
    });
  });
});
