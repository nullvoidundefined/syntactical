import { validateQuestionBank } from '../validateQuestionBank';

const query = { explanation: 'Explanation', title: 'Title' };
const validQuestion = { answer: true, id: 'q-valid', prompt: 'True?', query, type: 'bool' };

describe('validateQuestionBank empty tag', () => {
  it('drops a question whose tags include an empty string and keeps the rest', () => {
    const emptyTagQuestion = { ...validQuestion, id: 'q-empty-tag', query: { ...query, tags: [''] } };
    const result = validateQuestionBank({ questions: [validQuestion, emptyTagQuestion], schemaVersion: 1 });
    expect(result).toEqual({ droppedQuestionIds: ['q-empty-tag'], isValid: true, questions: [validQuestion] });
  });
});
