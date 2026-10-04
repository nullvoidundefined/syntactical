// DailyGoalPicker on the web (B-64): a radio group with one tab stop, where
// the arrow keys move focus and selection together and wrap at the ends.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import { DailyGoalPicker } from '../DailyGoalPicker';

function Harness({ isBusy = false, onSelect }: { isBusy?: boolean; onSelect?: (goal: number) => void }) {
  const [goal, setGoal] = useState(20);
  return (
    <>
      <span id="goal-heading">Daily goal</span>
      <DailyGoalPicker
        isBusy={isBusy}
        labelledBy="goal-heading"
        selectedGoal={goal}
        onSelect={(next) => {
          onSelect?.(next);
          setGoal(next);
        }}
      />
    </>
  );
}

function radio(goal: number): HTMLElement {
  return screen.getByRole('radio', { name: `${goal} XP a day` });
}

describe('DailyGoalPicker on the web', () => {
  it('is a radio group named by its heading with only the selected goal in the tab order', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Daily goal' })).toBeTruthy();
    expect(radio(20).getAttribute('aria-checked')).toBe('true');
    expect([radio(10).tabIndex, radio(20).tabIndex, radio(50).tabIndex]).toEqual([-1, 0, -1]);
  });

  it('moves focus and selection with the arrow keys and wraps at both ends', () => {
    render(<Harness />);
    act(() => radio(20).focus());
    fireEvent.keyDown(radio(20), { key: 'ArrowRight' });
    expect(radio(50).getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(radio(50));
    expect(radio(50).tabIndex).toBe(0);
    fireEvent.keyDown(radio(50), { key: 'ArrowDown' });
    expect(radio(10).getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(radio(10));
    fireEvent.keyDown(radio(10), { key: 'ArrowLeft' });
    expect(radio(50).getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(radio(50), { key: 'ArrowUp' });
    expect(radio(20).getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(radio(20));
  });

  it('ignores other keys and does nothing while a change is saving', () => {
    const onSelect = jest.fn();
    const { unmount } = render(<Harness onSelect={onSelect} />);
    fireEvent.keyDown(radio(20), { key: 'a' });
    expect(radio(20).getAttribute('aria-checked')).toBe('true');
    unmount();
    render(<Harness isBusy onSelect={onSelect} />);
    fireEvent.keyDown(radio(20), { key: 'ArrowRight' });
    expect(radio(20).getAttribute('aria-checked')).toBe('true');
    expect(onSelect).not.toHaveBeenCalled();
  });
});
