// components/auth/__tests__/AccountControlHydration.test.tsx
// The app bar's account control renders nothing until AuthProvider has read the stored identity, so the static HTML
// and the first client render never show a "Sign in" link to a signed-in user; once read, a guest sees "Sign in" and
// a signed-in user the sign-out control.
import { render, screen } from '@testing-library/react-native';

import { AccountControl } from '../AccountControl';

let mockAuth = { isHydrated: false, isSignedIn: false };

jest.mock('../../../state/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('../SignOutDialog', () => ({
  SignOutDialog: () => require('react').createElement(require('react-native').Text, null, 'Sign out'),
}));

describe('AccountControl before and after auth hydration', () => {
  it('renders nothing before the stored identity is read', async () => {
    mockAuth = { isHydrated: false, isSignedIn: false };
    await render(<AccountControl />);
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByText('Sign out')).toBeNull();
  });

  it('shows a hydrated guest the Sign in link', async () => {
    mockAuth = { isHydrated: true, isSignedIn: false };
    await render(<AccountControl />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
  });

  it('shows a hydrated signed-in user the sign-out control and no Sign in link', async () => {
    mockAuth = { isHydrated: true, isSignedIn: true };
    await render(<AccountControl />);
    expect(screen.getByText('Sign out')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });
});
