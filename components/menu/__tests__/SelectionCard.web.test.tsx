import { render, screen } from '@testing-library/react';

import { SelectionCard } from '../SelectionCard';

describe('SelectionCard on the web', () => {
  it('takes its accessible name from the visible title and subtitle, not the key-hint badge', () => {
    render(<SelectionCard keyHint={1} title="Python" subtitle="Idioms and internals." onSelect={jest.fn()} />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-label')).toBeNull();
    expect(screen.getByRole('button', { name: /^Python\s*Idioms and internals\.$/ })).toBe(button);
  });

  it('includes a visible status label in the accessible name', () => {
    render(<SelectionCard isDisabled keyHint={3} title="Hard" subtitle="Edge cases." statusLabel="Coming soon" onSelect={jest.fn()} />);
    expect(screen.getByRole('button', { name: /^Hard\s*Edge cases\.\s*Coming soon$/ })).toBeTruthy();
  });
});
