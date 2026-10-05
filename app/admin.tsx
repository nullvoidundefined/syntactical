// Admin route: an admin turns paid question banks on or off for their own account. The server
// decides who is an admin; anyone else, a guest, and a failed load see the not-available text.
// A bank bought through the store shows as purchased and cannot be switched here. A refused or
// failed change is announced in one fixed message.
import { Pressable, ScrollView, Text, View } from 'react-native';

import { describeProduct } from '../services/admin/describeProduct';
import { useAdminAccess } from '../state/useAdminAccess';
import { useLanguageManifest } from '../state/useLanguageManifest';

const CHANGE_FAILED = 'The change was not saved. Check your connection and try again.';
const NOT_AVAILABLE = 'This page is not available.';

export default function AdminScreen() {
  const manifest = useLanguageManifest();
  const { isFailed, pendingIds, setAccess, state } = useAdminAccess();

  return (
    <ScrollView contentContainerClassName="flex-grow items-center px-4 py-8">
      <View className="w-full max-w-xl">
        {state.status === 'unavailable' ? (
          <Text className="font-mono text-sm text-ink">{NOT_AVAILABLE}</Text>
        ) : (
          <>
            <Text role="heading" aria-level={1} className="font-mono text-3xl text-ink">
              Admin
            </Text>
            {state.status === 'ready' ? (
              <View className="mt-6">
                {state.products.map(({ grantSource, isGranted, productId }) => {
                  const isPurchased = grantSource === 'purchase';
                  const isDisabled = isPurchased || pendingIds.has(productId);
                  const name = describeProduct(productId, manifest);
                  return (
                    <View key={productId} className="flex-row items-center justify-between border-b border-line py-3">
                      <Text className="text-sm text-ink">{name}</Text>
                      <View className="flex-row items-center gap-3">
                        {isPurchased ? <Text className="text-sm text-muted">Purchased</Text> : null}
                        <Pressable
                          role="switch"
                          aria-label={name}
                          aria-checked={isGranted}
                          aria-disabled={isDisabled}
                          disabled={isDisabled}
                          onPress={() => void setAccess(productId, !isGranted)}
                        >
                          <Text className="font-mono text-xs uppercase tracking-widest text-ink">
                            {isGranted ? 'On' : 'Off'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
            {isFailed ? (
              <Text role="alert" className="mt-3 text-sm text-ink">
                {CHANGE_FAILED}
              </Text>
            ) : null}
          </>
        )}
      </View>
    </ScrollView>
  );
}
