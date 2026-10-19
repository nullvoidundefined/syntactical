import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef, useRef, type RefObject } from 'react';
import { Pressable, View } from 'react-native';

import { isModalOpen } from '../../../state/modalOpenSignal';
import { useModalPanel } from '../useModalPanel';

type PanelHarnessProps = {
  onClose: () => void;
  returnFocusTo?: RefObject<View | null>;
  allDisabled?: boolean;
};

function PanelHarness({ onClose, returnFocusTo, allDisabled = false }: PanelHarnessProps) {
  const panelRef = useRef<View>(null);
  useModalPanel(panelRef, { onClose, returnFocusTo });

  return (
    <View ref={panelRef} role="dialog" tabIndex={-1}>
      <Pressable role="button" aria-label="Disabled first" aria-disabled={true} disabled />
      <Pressable role="button" aria-label="First enabled" disabled={allDisabled} />
      <Pressable role="button" aria-label="Last enabled" disabled={allDisabled} />
      <Pressable role="button" aria-label="Aria disabled last" aria-disabled={true} tabIndex={0} />
    </View>
  );
}

describe('useModalPanel on the web', () => {
  it('focuses the panel on mount', () => {
    render(<PanelHarness onClose={jest.fn()} />);

    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('handles Escape in capture phase before document bubble listeners', () => {
    const onClose = jest.fn();
    const onBubble = jest.fn();
    document.addEventListener('keydown', onBubble);
    try {
      render(<PanelHarness onClose={onClose} />);
      const panel = screen.getByRole('dialog');

      fireEvent.keyDown(panel, { key: 'Escape', code: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onBubble).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(panel);
    } finally {
      document.removeEventListener('keydown', onBubble);
    }
  });

  it('wraps Tab and Shift+Tab between enabled controls, skipping disabled controls at either end', () => {
    render(<PanelHarness onClose={jest.fn()} />);
    const first = screen.getByRole('button', { name: 'First enabled' });
    const last = screen.getByRole('button', { name: 'Last enabled' });

    act(() => {
      last.focus();
      fireEvent.keyDown(last, { key: 'Tab', code: 'Tab' });
    });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: 'Tab', code: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it.each([false, true])('moves Tab from the panel or outside to an enabled control (shiftKey=%s)', (shiftKey) => {
    render(<Pressable role="button" aria-label="Outside" />);
    render(<PanelHarness onClose={jest.fn()} />);
    const panel = screen.getByRole('dialog');
    const outside = screen.getByRole('button', { name: 'Outside' });
    const target = screen.getByRole('button', { name: shiftKey ? 'Last enabled' : 'First enabled' });

    fireEvent.keyDown(panel, { key: 'Tab', code: 'Tab', shiftKey });
    expect(document.activeElement).toBe(target);

    act(() => {
      outside.focus();
    });
    expect(document.activeElement).toBe(outside);
    fireEvent.keyDown(outside, { key: 'Tab', code: 'Tab', shiftKey });
    expect(document.activeElement).toBe(target);
  });

  it.each([false, true])('prevents Tab and keeps focus on the panel when all controls are disabled (shiftKey=%s)',
    (shiftKey) => {
      render(<PanelHarness onClose={jest.fn()} allDisabled />);
      const panel = screen.getByRole('dialog');

      const isDefaultAllowed = fireEvent.keyDown(panel, { key: 'Tab', code: 'Tab', shiftKey });

      expect(isDefaultAllowed).toBe(false);
      expect(document.activeElement).toBe(panel);
    },
  );

  it('keeps control focus on rerender and uses the latest onClose for Escape', () => {
    const originalOnClose = jest.fn();
    const latestOnClose = jest.fn();
    const { rerender } = render(<PanelHarness onClose={originalOnClose} />);
    const button = screen.getByRole('button', { name: 'First enabled' });
    act(() => {
      button.focus();
    });

    rerender(<PanelHarness onClose={latestOnClose} />);

    expect(document.activeElement).toBe(button);
    fireEvent.keyDown(button, { key: 'Escape', code: 'Escape' });
    expect(latestOnClose).toHaveBeenCalledTimes(1);
    expect(originalOnClose).not.toHaveBeenCalled();
  });

  it('restores the previously focused element and removes Escape handling on unmount', () => {
    render(<Pressable role="button" aria-label="Previous focus" />);
    const previous = screen.getByRole('button', { name: 'Previous focus' });
    act(() => {
      previous.focus();
    });
    expect(document.activeElement).toBe(previous);
    const onClose = jest.fn();
    const { unmount } = render(<PanelHarness onClose={onClose} />);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));

    unmount();

    expect(document.activeElement).toBe(previous);
    fireEvent.keyDown(previous, { key: 'Escape', code: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('restores the explicit returnFocusTo target instead of the previously focused element', () => {
    const returnFocusTo = createRef<View>();
    render(
      <View>
        <Pressable role="button" aria-label="Previous focus" />
        <Pressable ref={returnFocusTo} role="button" aria-label="Return target" />
      </View>,
    );
    const previous = screen.getByRole('button', { name: 'Previous focus' });
    act(() => {
      previous.focus();
    });
    expect(document.activeElement).toBe(previous);
    const { unmount } = render(<PanelHarness onClose={jest.fn()} returnFocusTo={returnFocusTo} />);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));

    unmount();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Return target' }));
  });

  it('marks a modal open only while mounted', () => {
    expect(isModalOpen()).toBe(false);
    const { unmount } = render(<PanelHarness onClose={jest.fn()} />);

    expect(isModalOpen()).toBe(true);

    unmount();

    expect(isModalOpen()).toBe(false);
  });
});
