import { describe, expect, it } from 'vitest';

import { validateQuestionBank } from '../validateQuestionBank.js';

const CONTEXT = { topicIds: [], misconceptionIds: [] };

const provenance = { isHumanReviewed: false, source: 'original', validation: { method: 'executed', status: 'passed' } };
const docs = [{ title: 'String functions', url: 'https://www.postgresql.org/docs/current/functions-string.html' }];
const query = { docs, explanation: 'Explanation', title: 'Title' };
const validQuestion = { answer: true, id: 'q-valid', prompt: 'True?', provenance, query, type: 'bool' };

function withDocs(id: string, value: unknown) {
  return { ...validQuestion, id, query: { ...query, docs: value } };
}

describe('validateQuestionBank doc links', () => {
  it('keeps a query with https doc links', () => {
    const result = validateQuestionBank({ questions: [validQuestion], schemaVersion: 2 }, CONTEXT);
    expect(result).toMatchObject({ isValid: true, questions: [validQuestion] });
  });

  it.each([
    ['q-http', [{ title: 'Docs', url: 'http://example.com/docs' }]],
    ['q-blank-title', [{ title: ' ', url: 'https://example.com/docs' }]],
    ['q-no-url', [{ title: 'Docs' }]],
    ['q-empty-list', []],
    ['q-not-list', 'https://example.com/docs'],
    [
      'q-too-many',
      Array.from({ length: 4 }, (_, index) => ({ title: `Docs ${index}`, url: `https://example.com/${index}` })),
    ],
  ])('drops %s and keeps the rest', (id, value) => {
    const result = validateQuestionBank({ questions: [validQuestion, withDocs(id, value)], schemaVersion: 2 }, CONTEXT);
    expect(result).toEqual({
      dropped: [{ id, rule: 'malformed question' }],
      droppedQuestionIds: [id],
      isValid: true,
      questions: [validQuestion],
    });
  });

  it('keeps a boolean isSyntaxAfterAnswer and drops any other value', () => {
    const marked = { ...validQuestion, id: 'q-marked', query: { ...query, isSyntaxAfterAnswer: true } };
    const bad = { ...validQuestion, id: 'q-bad-flag', query: { ...query, isSyntaxAfterAnswer: 'yes' } };
    const result = validateQuestionBank({ questions: [marked, bad], schemaVersion: 2 }, CONTEXT);
    expect(result).toMatchObject({ dropped: [{ id: 'q-bad-flag', rule: 'malformed question' }], questions: [marked] });
  });
});
