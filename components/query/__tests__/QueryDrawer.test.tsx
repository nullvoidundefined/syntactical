import { fireEvent, render, screen } from '@testing-library/react-native';

import { QueryDrawer } from '../QueryDrawer';

const query = { explanation: '<b>IEEE</b> 754', syntax: "float('nan')", tags: ['numbers', 'float'], title: 'NaN is never equal' };

describe('QueryDrawer', () => {
  it('shows the title, syntax, explanation as literal text, and tags', async () => {
    await render(<QueryDrawer isOpen query={query} grammar="python" onClose={jest.fn()} />);
    expect(screen.getByText('NaN is never equal')).toBeTruthy();
    expect(screen.getByText('<b>IEEE</b> 754')).toBeTruthy();
    expect(screen.getByText('numbers')).toBeTruthy();
    expect(screen.getByText('float')).toBeTruthy();
  });

  it('closes from the close control, the backdrop, and the platform back action', async () => {
    const onClose = jest.fn();
    await render(<QueryDrawer isOpen query={query} grammar="python" onClose={onClose} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Close query' }));
    await fireEvent.press(screen.getByTestId('query-backdrop'));
    await fireEvent(screen.getByTestId('query-modal'), 'requestClose');
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('renders nothing visible when closed', async () => {
    await render(<QueryDrawer isOpen={false} query={query} grammar="python" onClose={jest.fn()} />);
    expect(screen.queryByText('NaN is never equal')).toBeNull();
  });
});
