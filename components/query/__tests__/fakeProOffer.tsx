// A stand-in for ProOffer that only reports how it closed: "Unlock" as unlocked, "Not now" as closed.
import { Pressable, Text, View } from 'react-native';

import type { ProOfferCloseReason } from '../../purchase/ProOffer';

export function ProOffer({ onClose }: { onClose: (reason: ProOfferCloseReason) => void }) {
  return (
    <View>
      <Pressable role="button" aria-label="Unlock" onPress={() => onClose('unlocked')}>
        <Text>Unlock</Text>
      </Pressable>
      <Pressable role="button" aria-label="Not now" onPress={() => onClose('closed')}>
        <Text>Not now</Text>
      </Pressable>
    </View>
  );
}
