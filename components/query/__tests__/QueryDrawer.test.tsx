import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { QueryDrawer } from '../QueryDrawer';

const query = {
  explanation: '<b>IEEE</b> 754',
  syntax: "float('nan')",
  tags: ['numbers', 'float'],
  title: 'NaN is never equal',
};

type HostNode = ReturnType<typeof screen.getByText>;

const NOTCH_INSETS = { bottom: 34, left: 0, right: 0, top: 48 };

// The total padding on one side that every ancestor of a node adds, so a test can tell whether the
// node sits clear of the device's status bar or home indicator.
function sumAncestorPadding(node: HostNode, side: 'paddingBottom' | 'paddingTop'): number {
  let total = 0;
  for (let current: HostNode | null = node; current; current = current.parent) {
    const style = StyleSheet.flatten(current.props.style) ?? {};
    const value = style[side] ?? style.paddingVertical ?? style.padding;
    if (typeof current.type === 'string' && typeof value === 'number') total += value;
  }
  return total;
}

function DrawerHarness() {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <>
      <Pressable role="button" aria-label="Open query" onPress={() => setIsOpen(true)}>
        <Text>Open query</Text>
      </Pressable>
      <QueryDrawer isOpen={isOpen} query={query} grammar="python" onClose={() => setIsOpen(false)} />
    </>
  );
}

describe('QueryDrawer', () => {
  it('shows the title, syntax, explanation as literal text, and tags', async () => {
    await render(<QueryDrawer isOpen query={query} grammar="python" onClose={jest.fn()} />);
    expect(screen.getByText('NaN is never equal')).toBeTruthy();
    expect(screen.getByText('<b>IEEE</b> 754')).toBeTruthy();
    expect(screen.getByText('numbers')).toBeTruthy();
    expect(screen.getByText('float')).toBeTruthy();
  });

  it('closes from the close control, the backdrop, and the platform back action', async () => {
    await render(<DrawerHarness />);
    await fireEvent.press(screen.getByRole('button', { name: 'Close query' }));
    expect(screen.queryByText('NaN is never equal')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Open query' }));
    await fireEvent.press(screen.getByTestId('query-backdrop'));
    expect(screen.queryByText('NaN is never equal')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Open query' }));
    await fireEvent(screen.getByTestId('query-modal'), 'requestClose');
    expect(screen.queryByText('NaN is never equal')).toBeNull();
  });

  it('renders nothing visible when closed', async () => {
    await render(<QueryDrawer isOpen={false} query={query} grammar="python" onClose={jest.fn()} />);
    expect(screen.queryByText('NaN is never equal')).toBeNull();
  });

  it('shows the chosen rationale under its own heading above the query title', async () => {
    await render(
      <QueryDrawer
        isOpen
        query={query}
        grammar="python"
        chosenRationale="You treated NaN as a normal number."
        onClose={jest.fn()}
      />,
    );
    const headings = screen.getAllByRole('heading');
    expect(headings.map((heading) => heading.props.children)).toEqual([
      'Why that answer is tempting',
      'NaN is never equal',
    ]);
    expect(screen.getByText('You treated NaN as a normal number.')).toBeTruthy();
  });

  it('keeps heading levels from skipping when the rationale is shown', async () => {
    await render(<QueryDrawer isOpen query={query} grammar="python" chosenRationale="Because." onClose={jest.fn()} />);
    const levels = screen.getAllByRole('heading').map((heading) => heading.props['aria-level']);
    expect(levels).toEqual([2, 2]);
  });

  it('shows only the query when there is no rationale', async () => {
    await render(<QueryDrawer isOpen query={query} grammar="python" onClose={jest.fn()} />);
    expect(screen.queryByText('Why that answer is tempting')).toBeNull();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });

  it('keeps its header below the status bar and its content above the home indicator', async () => {
    await render(
      <SafeAreaProvider initialMetrics={{ frame: { height: 800, width: 400, x: 0, y: 0 }, insets: NOTCH_INSETS }}>
        <QueryDrawer isOpen query={query} grammar="python" onClose={jest.fn()} />
      </SafeAreaProvider>,
    );
    expect(sumAncestorPadding(screen.getByText('Query'), 'paddingTop')).toBeGreaterThanOrEqual(NOTCH_INSETS.top);
    expect(sumAncestorPadding(screen.getByText('float'), 'paddingBottom')).toBeGreaterThanOrEqual(NOTCH_INSETS.bottom);
  });
});
