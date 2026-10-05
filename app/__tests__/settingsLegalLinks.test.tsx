// Settings Legal section: each link opens its own legal route.
import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';

import SettingsScreen from '../settings';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('../../state/AuthProvider', () => ({ useAuth: () => ({ isSignedIn: false }) }));
jest.mock('../../state/StatsProvider', () => ({ useQuizStats: () => ({ setDailyGoal: jest.fn() }) }));
jest.mock('../../state/useProfile', () => ({ useProfile: () => ({ updateDailyGoal: jest.fn() }) }));
jest.mock('../../state/useProgressSummary', () => ({ useProgressSummary: () => ({ dailyGoal: 20 }) }));
jest.mock('../../state/usePurchases', () => ({ usePurchases: () => ({ restore: jest.fn() }) }));

describe('settings legal links', () => {
  it('opens the privacy policy from the Privacy policy link', async () => {
    const screen = await render(<SettingsScreen />);

    fireEvent.press(screen.getByRole('link', { name: 'Privacy policy' }));

    expect(router.push).toHaveBeenCalledWith('/privacy');
  });

  it('opens the deletion page from the Account deletion link', async () => {
    const screen = await render(<SettingsScreen />);

    fireEvent.press(screen.getByRole('link', { name: 'Account deletion' }));

    expect(router.push).toHaveBeenCalledWith('/delete-account');
  });
});
