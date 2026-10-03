import type { Question } from '@syntactical/content-schema';
import { render, screen, within } from '@testing-library/react';

import { AbCard } from '../AbCard';
import { TEST_PROVENANCE } from '../../../services/content/__tests__/fixtures/contentFixtures';

const question: Extract<Question, { type: 'ab' }> = {
  answerIndex: 1,
  choices: [{ code: 'total = sum(xs)', text: 'builtin' }, { code: 'total = loop(xs)', text: 'loop' }],
  criterion: { evidence: 'e', statement: 'Lower runtime wins', type: 'performance' },
  id: 'q-ab',
  prompt: 'Which is optimal?',
  provenance: TEST_PROVENANCE,
  query: { explanation: 'e', title: 't' },
  type: 'ab',
};

describe('AbCard on the web', () => {
  it('exposes each snippet to a screen reader inside a group named for its option', () => {
    render(<AbCard question={question} grammar="python" submittedAnswer={null} isAnswered={false} onSelect={() => undefined} />);
    const optionA = screen.getByRole('group', { name: 'Option A' });
    const optionB = screen.getByRole('group', { name: 'Option B' });
    expect(within(optionA).queryByText('total = sum(xs)')).not.toBeNull();
    expect(within(optionA).queryByText('total = loop(xs)')).toBeNull();
    expect(within(optionB).queryByText('total = loop(xs)')).not.toBeNull();
  });
});
