// A question may name its own grammar from GRAMMARS; any other value drops the question.
import { describe, expect, it } from 'vitest';

import { validateQuestionBank } from '../validateQuestionBank.js';

const CONTEXT = { topicIds: [], misconceptionIds: [] };
const PROVENANCE = {
  source: 'generated',
  validation: { method: 'executed', status: 'passed' },
  isHumanReviewed: false,
};

function buildMc(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    type: 'mc',
    prompt: 'Which row does the query return?',
    code: "SELECT name FROM users WHERE id = '1' OR '1'='1'",
    choices: [{ text: 'Only user 1' }, { text: 'Every user' }],
    answerIndex: 1,
    query: { title: 'Tautology injection', explanation: "'1'='1' is always true." },
    provenance: PROVENANCE,
    ...overrides,
  };
}

function buildBank(questions: unknown[]): Record<string, unknown> {
  return { schemaVersion: 2, questions };
}

describe('validateQuestionBank question grammar', () => {
  it("keeps an mc question with grammar 'sql'", () => {
    const question = buildMc('q-1', { grammar: 'sql' });
    expect(validateQuestionBank(buildBank([question]), CONTEXT)).toEqual({
      dropped: [],
      droppedQuestionIds: [],
      isValid: true,
      questions: [question],
    });
  });

  it("keeps a bool question with grammar 'plain'", () => {
    const question = {
      id: 'q-2',
      type: 'bool',
      prompt: 'SameSite=Lax blocks a cross-site POST from sending the cookie.',
      answer: true,
      grammar: 'plain',
      query: { title: 'SameSite=Lax', explanation: 'Lax withholds cookies on cross-site POST.' },
      provenance: PROVENANCE,
    };
    const result = validateQuestionBank(buildBank([question]), CONTEXT);
    expect(result.isValid && result.questions).toEqual([question]);
  });

  it('keeps a question with no grammar', () => {
    const question = buildMc('q-3');
    const result = validateQuestionBank(buildBank([question]), CONTEXT);
    expect(result.isValid && result.questions).toEqual([question]);
  });

  it.each([['html'], ['Python'], [''], [7], [null]])('drops a question whose grammar is %j', (grammar) => {
    const kept = buildMc('q-1');
    const result = validateQuestionBank(buildBank([kept, buildMc('q-2', { grammar })]), CONTEXT);
    expect(result).toEqual({
      dropped: [{ id: 'q-2', rule: 'unknown-grammar' }],
      droppedQuestionIds: ['q-2'],
      isValid: true,
      questions: [kept],
    });
  });
});
