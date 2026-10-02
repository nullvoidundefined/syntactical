import { render, screen } from '@testing-library/react-native';

import { KeyboardHintBar } from '../KeyboardHintBar';

describe('KeyboardHintBar on native', () => {
  it('renders no hints', async () => {
    await render(<KeyboardHintBar questionType="mc" isAnswered={false} />);
    expect(screen.queryByText('select')).toBeNull();
    expect(screen.queryByText('query')).toBeNull();
  });
});
