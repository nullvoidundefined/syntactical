import { resolveQuestionGrammar } from '../resolveQuestionGrammar';

describe('resolveQuestionGrammar', () => {
  it('uses the question grammar when it has one', () => {
    expect(resolveQuestionGrammar({ grammar: 'sql' }, 'python')).toBe('sql');
  });

  it('falls back to the entry grammar', () => {
    expect(resolveQuestionGrammar({}, 'plain')).toBe('plain');
  });
});
