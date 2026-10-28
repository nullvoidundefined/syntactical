// The questions of a review round over several misconceptions: the union of each one's local
// questions, each question once, taken in turn from each misconception, at most 10, in an order
// that does not depend on the index's insertion order.
import type { Question } from '@syntactical/content-schema';

import { listPracticeQuestions } from '../listPracticeQuestions';
import type { ReviewQuestion } from '../types/ReviewQuestion';

const PROVENANCE: Question['provenance'] = {
  isHumanReviewed: false,
  source: 'original',
  validation: { method: 'judged', status: 'pending' },
};

function bool(id: string, misconceptionId: string): Question {
  return {
    answer: true,
    id,
    misconceptionId,
    prompt: 'p',
    provenance: PROVENANCE,
    query: { explanation: 'e', title: 't' },
    type: 'bool',
  };
}

function mc(id: string, misconceptionIds: string[]): Question {
  return {
    answerIndex: 0,
    choices: [
      { text: 'right' },
      ...misconceptionIds.map((misconceptionId) => ({ misconceptionId, text: misconceptionId })),
    ],
    id,
    prompt: 'p',
    provenance: PROVENANCE,
    query: { explanation: 'e', title: 't' },
    type: 'mc',
  };
}

function indexOf(questions: Question[]): Map<string, ReviewQuestion> {
  return new Map(questions.map((question) => [question.id, { difficulty: 'easy', language: 'python', question }]));
}

function ids(questions: ReviewQuestion[]): string[] {
  return questions.map(({ question }) => question.id);
}

describe('listPracticeQuestions', () => {
  it("takes the misconceptions' questions in turn, in the order the misconceptions are given", () => {
    const index = indexOf([
      bool('a-1', 'x.a'),
      bool('a-2', 'x.a'),
      bool('a-3', 'x.a'),
      bool('b-1', 'x.b'),
      bool('b-2', 'x.b'),
    ]);

    expect(ids(listPracticeQuestions(index, ['x.a', 'x.b']))).toEqual(['a-1', 'b-1', 'a-2', 'b-2', 'a-3']);
    expect(ids(listPracticeQuestions(index, ['x.b', 'x.a']))).toEqual(['b-1', 'a-1', 'b-2', 'a-2', 'a-3']);
  });

  it('plays a question that reveals two of the misconceptions once', () => {
    const index = indexOf([mc('both', ['x.a', 'x.b']), bool('a-1', 'x.a'), bool('b-1', 'x.b')]);

    expect(ids(listPracticeQuestions(index, ['x.a', 'x.b']))).toEqual(['a-1', 'b-1', 'both']);
  });

  it('plays at most 10 questions', () => {
    const questions = ['x.a', 'x.b', 'x.c'].flatMap((misconceptionId) =>
      Array.from({ length: 5 }, (_unused, position) => bool(`${misconceptionId}-${position}`, misconceptionId)),
    );

    const round = ids(listPracticeQuestions(indexOf(questions), ['x.a', 'x.b', 'x.c']));

    expect(round).toHaveLength(10);
    expect(round.slice(0, 3)).toEqual(['x.a-0', 'x.b-0', 'x.c-0']);
  });

  it('lists the same round whatever order the index holds the questions in', () => {
    const questions = [bool('a-2', 'x.a'), bool('b-1', 'x.b'), bool('a-1', 'x.a'), bool('b-2', 'x.b')];

    const forward = ids(listPracticeQuestions(indexOf(questions), ['x.a', 'x.b']));
    const reversed = ids(listPracticeQuestions(indexOf([...questions].reverse()), ['x.a', 'x.b']));

    expect(forward).toEqual(['a-1', 'b-1', 'a-2', 'b-2']);
    expect(reversed).toEqual(forward);
  });

  it('skips a misconception with no local questions and a repeated id', () => {
    const index = indexOf([bool('a-1', 'x.a'), bool('a-2', 'x.a'), bool('b-1', 'x.b')]);

    expect(ids(listPracticeQuestions(index, ['x.gone', 'x.a', 'x.a', 'x.b']))).toEqual(['a-1', 'b-1', 'a-2']);
    expect(listPracticeQuestions(index, ['x.gone'])).toEqual([]);
  });
});
