import { act, render } from '@testing-library/react';

import { ResultsScreen } from '../ResultsScreen';

function pressKeyOn(target: EventTarget, key: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
  });
}

describe('ResultsScreen keyboard bindings on the web', () => {
  it('ignores Enter and Escape typed into a text field, and honors them otherwise', () => {
    const onRetry = jest.fn();
    const onMenu = jest.fn();
    render(<ResultsScreen accuracy={50} correctCount={1} totalQuestions={2} languageLabel="Python" difficultyLabel="Easy" onMenu={onMenu} onRetry={onRetry} />);
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.focus();
    pressKeyOn(field, 'Enter');
    pressKeyOn(field, 'Escape');
    expect(onRetry).not.toHaveBeenCalled();
    expect(onMenu).not.toHaveBeenCalled();
    field.remove();
    pressKeyOn(window, 'Enter');
    pressKeyOn(window, 'Escape');
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onMenu).toHaveBeenCalledTimes(1);
  });
});
