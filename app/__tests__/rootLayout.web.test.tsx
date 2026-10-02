import { render, screen } from '@testing-library/react';
import HomeScreen from '../index';

describe('home screen on the web', () => {
  it('renders exactly one h1 carrying the app title', () => {
    render(<HomeScreen />);
    const headings = document.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('syntactical_');
  });
});
