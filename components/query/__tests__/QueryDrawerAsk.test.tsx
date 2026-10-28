// The drawer shows "Ask about this card" only after an answer and only when the round passes an
// ask target, and its "Explain my mistake" button only when, besides, the answer was wrong; the
// panel itself is covered in AskPanel.test and AskPanelExplain.test.
import { render, screen } from '@testing-library/react-native';

import { QueryDrawer } from '../QueryDrawer';

jest.mock('../../../services/ask/requestAskAnswer', () => ({ requestAskAnswer: jest.fn() }));

const query = { explanation: 'Because', title: 'Lists' };
const askTarget = { bankKey: 'python/easy', choiceIndex: 0, questionId: 'py-easy-0' };

function renderDrawer(props: { askTarget?: typeof askTarget; isAnswered: boolean; isMistake?: boolean }) {
  return render(<QueryDrawer {...props} isOpen query={query} grammar="python" onClose={jest.fn()} />);
}

describe('QueryDrawer ask box', () => {
  it('shows the ask box after an answer when there is a target', async () => {
    await renderDrawer({ askTarget, isAnswered: true });

    expect(screen.getByRole('heading', { name: 'Ask about this card' })).toBeTruthy();
  });

  it('hides the ask box before an answer, even with a target', async () => {
    await renderDrawer({ askTarget, isAnswered: false });

    expect(screen.queryByRole('heading', { name: 'Ask about this card' })).toBeNull();
  });

  it('hides the ask box when there is no target', async () => {
    await renderDrawer({ isAnswered: true });

    expect(screen.queryByRole('heading', { name: 'Ask about this card' })).toBeNull();
  });

  it('shows Explain my mistake after a wrong answer when there is a target', async () => {
    await renderDrawer({ askTarget, isAnswered: true, isMistake: true });

    expect(screen.getByRole('button', { name: 'Explain my mistake' })).toBeTruthy();
  });

  it.each([
    ['after a right answer', { askTarget, isAnswered: true, isMistake: false }],
    ['when the round does not say the answer was wrong', { askTarget, isAnswered: true }],
    ['when there is no target, as for a guest', { isAnswered: true, isMistake: true }],
    ['before an answer', { askTarget, isAnswered: false, isMistake: true }],
  ])('hides Explain my mistake %s', async (_name, props) => {
    await renderDrawer(props);

    expect(screen.queryByRole('button', { name: 'Explain my mistake' })).toBeNull();
  });
});
