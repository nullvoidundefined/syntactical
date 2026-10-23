// The drawer shows "Ask about this card" only after an answer and only when the round passes an
// ask target; the panel itself is covered in AskPanel.test.
import { render, screen } from '@testing-library/react-native';

import { QueryDrawer } from '../QueryDrawer';

jest.mock('../../../services/ask/requestAskAnswer', () => ({ requestAskAnswer: jest.fn() }));

const query = { explanation: 'Because', title: 'Lists' };
const askTarget = { bankKey: 'python/easy', choiceIndex: 0, questionId: 'py-easy-0' };

function renderDrawer(props: { askTarget?: typeof askTarget; isAnswered: boolean }) {
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
});
