// The app bar's account control: a "Sign in" link for a guest, the "Sign out"
// and "Delete account" controls for a signed-in user.
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '../../state/AuthProvider';

import { DeleteAccountDialog } from './DeleteAccountDialog';
import { SignOutDialog } from './SignOutDialog';

export function AccountControl() {
  const { isSignedIn } = useAuth();
  if (isSignedIn) {
    return (
      <View className="flex-row items-center gap-4">
        <SignOutDialog />
        <DeleteAccountDialog />
      </View>
    );
  }
  return (
    <Pressable role="link" aria-label="Sign in" onPress={() => router.push('/sign-in')}>
      <Text className="font-mono text-xs uppercase tracking-widest text-ink">Sign in</Text>
    </Pressable>
  );
}
