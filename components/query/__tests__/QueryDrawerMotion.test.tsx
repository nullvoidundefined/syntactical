import { render, screen } from '@testing-library/react-native';

import { useIsReducedMotion } from '../../../state/useIsReducedMotion';
import { QueryDrawer } from '../QueryDrawer';

jest.mock('../../../state/useIsReducedMotion', () => ({ useIsReducedMotion: jest.fn() }));

const query = {
  explanation: 'IEEE 754',
  syntax: "float('nan')",
  tags: ['numbers'],
  title: 'NaN is never equal',
};

describe('QueryDrawer motion', () => {
  it('does not slide in under reduced motion', async () => {
    jest.mocked(useIsReducedMotion).mockReturnValue(true);
    await render(<QueryDrawer isOpen query={query} grammar="python" onClose={jest.fn()} />);
    expect(screen.getByTestId('query-modal').props.animationType).toBe('none');
  });

  it('slides in when motion is allowed', async () => {
    jest.mocked(useIsReducedMotion).mockReturnValue(false);
    await render(<QueryDrawer isOpen query={query} grammar="python" onClose={jest.fn()} />);
    expect(screen.getByTestId('query-modal').props.animationType).toBe('slide');
  });
});
