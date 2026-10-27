// Settings' "Privacy settings" row: reopens Google's consent form. Shown only when the consent SDK says this
// user must be able to change their choice (EEA and UK users), so everyone else sees no extra control.
import { Pressable, Text } from 'react-native';

import { useSponsor } from '../../state/SponsorProvider';

export function PrivacySettingsRow() {
  const { privacyOptionsRequired, showPrivacyOptions } = useSponsor();
  if (!privacyOptionsRequired) return null;
  return (
    <Pressable role="button" aria-label="Privacy settings" onPress={() => void showPrivacyOptions()}>
      <Text className="font-mono text-xs uppercase tracking-widest text-ink">Privacy settings</Text>
    </Pressable>
  );
}
