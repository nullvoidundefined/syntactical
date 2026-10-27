// The app bar's account control: nothing until the stored identity is read (so the static HTML and the first client
// render never offer a signed-in user "Sign in"), then a "Sign in" link for a guest and the "Sign out" control for a
// signed-in user.
import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { useAuth } from '../../state/AuthProvider';

import { SignOutDialog } from './SignOutDialog';

export function AccountControl() {
  const { isHydrated, isSignedIn } = useAuth();
  if (!isHydrated) return null;
  if (isSignedIn) return <SignOutDialog />;
  return (
    <Pressable role="link" aria-label="Sign in" onPress={() => router.push('/sign-in')}>
      <Text className="font-mono text-xs uppercase tracking-widest text-ink">Sign in</Text>
    </Pressable>
  );
}
