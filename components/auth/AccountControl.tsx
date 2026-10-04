// The app bar's account control: a "Sign in" link for a guest, the "Sign out"
// control for a signed-in user.
import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { useAuth } from '../../state/AuthProvider';

import { SignOutDialog } from './SignOutDialog';

export function AccountControl() {
  const { isSignedIn } = useAuth();
  if (isSignedIn) return <SignOutDialog />;
  return (
    <Pressable role="link" aria-label="Sign in" onPress={() => router.push('/sign-in')}>
      <Text className="font-mono text-xs uppercase tracking-widest text-ink">Sign in</Text>
    </Pressable>
  );
}
