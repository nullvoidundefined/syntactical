import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { QueryDrawer } from '../QueryDrawer';

const query = { explanation: '<b>IEEE</b> 754', syntax: "float('nan')", tags: ['numbers', 'float'], title: 'NaN is never equal' };

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
    await render(<QueryDrawer isOpen query={query} grammar="python" chosenRationale="You treated NaN as a normal number." onClose={jest.fn()} />);
    const headings = screen.getAllByRole('heading');
    expect(headings.map((heading) => heading.props.children)).toEqual(['Why that answer is tempting', 'NaN is never equal']);
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
});
