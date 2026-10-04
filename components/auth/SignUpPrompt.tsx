// The one-time sign-up prompt a guest sees on the results screen until they
// dismiss it (B-41): a labeled region with a heading, "Sign up" (opens the
// sign-in route), and "Not now" (hides it for good, persisted in the guest's
// stats). Hidden for a signed-in user and until auth and stats have loaded,
// so it never flashes for someone who already dismissed it.
import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { useAuth } from '../../state/AuthProvider';
import { useQuizStats } from '../../state/StatsProvider';

import { AuthButton } from './AuthButton';

const HEADING = 'Save your progress';
const HEADING_ID = 'sign-up-prompt-heading';

export function SignUpPrompt() {
  const { isHydrated: isAuthHydrated, isSignedIn } = useAuth();
  const { dismissSignUpPrompt, isHydrated: isStatsHydrated, stats } = useQuizStats();
  if (!isAuthHydrated || !isStatsHydrated || isSignedIn || stats.isSignUpPromptDismissed) return null;
  return (
    <View role="region" aria-labelledby={HEADING_ID} aria-label={HEADING} className="mt-10 w-full max-w-xs border border-line p-4">
      <Text role="heading" aria-level={2} nativeID={HEADING_ID} className="font-mono text-sm text-ink">
        {HEADING}
      </Text>
      <Text className="mt-2 text-sm text-muted">Sign up to keep your streak and XP on every device.</Text>
      <AuthButton label="Sign up" onPress={() => router.push('/sign-in')} />
      <AuthButton label="Not now" isPrimary={false} onPress={dismissSignUpPrompt} />
    </View>
  );
}
