import { render, screen } from '@testing-library/react';

import { KeyboardHintBar } from '../KeyboardHintBar';

describe('KeyboardHintBar on the web', () => {
  it('lists choice keys for an unanswered multiple-choice question', () => {
    render(<KeyboardHintBar questionType="mc" isAnswered={false} />);
    expect(screen.queryByText('1-4 / A-D')).not.toBeNull();
    expect(screen.queryByText('ENTER')).toBeNull();
  });

  it('lists T and F for an unanswered boolean question', () => {
    render(<KeyboardHintBar questionType="bool" isAnswered={false} />);
    expect(screen.queryByText('T / F')).not.toBeNull();
  });

  it('lists Enter once answered, and always lists Q and Escape', () => {
    render(<KeyboardHintBar questionType="mc" isAnswered />);
    expect(screen.queryByText('ENTER')).not.toBeNull();
    expect(screen.queryByText('1-4 / A-D')).toBeNull();
    expect(screen.queryByText('Q')).not.toBeNull();
    expect(screen.queryByText('ESC')).not.toBeNull();
  });
});
