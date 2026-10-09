// Admin route: an admin turns paid question banks on or off for their own account. The server
// decides who is an admin; a signed-in non-admin (the server answers 403) sees the not-available
// text, and any other failed load shows a load-failed text with a Retry button. Every state shows
// the one h1. Until the stored sign-in is read the page shows the loading state. With
// no signed-in user (a guest, or after sign-out) the screen replaces itself with the home page.
// A bank bought through the store shows as purchased and cannot be switched here. A refused or
// failed change is announced in one fixed message.
import { useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { router } from 'expo-router';

import { AuthButton } from '../components/auth/AuthButton';
import { describeProduct } from '../services/admin/describeProduct';
import { useAuth, useSignedInUserId } from '../state/AuthProvider';
import { useAdminAccess } from '../state/useAdminAccess';
import { useLanguageManifest } from '../state/useLanguageManifest';

const CHANGE_FAILED = 'The change was not saved. Check your connection and try again.';
const NOT_AVAILABLE = 'This page is not available.';
const LOAD_FAILED = 'The access list could not be loaded. Check your connection and try again.';

export default function AdminScreen() {
  const manifest = useLanguageManifest();
  const { isFailed, pendingIds, setAccess, state: loadedState } = useAdminAccess();
  const { isHydrated } = useAuth();
  const isSignedOut = useSignedInUserId() === null;
  const shouldLeave = isHydrated && isSignedOut;
  const state = isHydrated ? loadedState : ({ status: 'loading' } as const);

  useEffect(() => {
    if (shouldLeave) router.replace('/');
  }, [shouldLeave]);

  if (shouldLeave) return null;

  return (
    <ScrollView contentContainerClassName="flex-grow items-center px-4 py-8">
      <View className="w-full max-w-xl">
        <Text role="heading" aria-level={1} className="font-mono text-3xl text-ink">
          Admin
        </Text>
        {state.status === 'unavailable' ? (
          <Text className="mt-6 font-mono text-sm text-ink">{NOT_AVAILABLE}</Text>
        ) : null}
        {state.status === 'failed' ? (
          <View className="mt-6">
            <Text role="alert" className="font-mono text-sm text-ink">
              {LOAD_FAILED}
            </Text>
            <AuthButton isPrimary={false} label="Retry" onPress={state.retry} />
          </View>
        ) : null}
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
                      className={`flex-row items-center gap-2 rounded-full ${isDisabled ? 'opacity-50' : ''}`}
                    >
                      <View
                        testID={isGranted ? 'switch-track-on' : 'switch-track-off'}
                        aria-hidden
                        importantForAccessibility="no-hide-descendants"
                        className={`h-7 w-12 justify-center rounded-full border-2 px-0.5 ${isGranted ? 'border-signal bg-signal' : 'border-ink bg-surface-raised'}`}
                      >
                        <View
                          testID={isGranted ? 'switch-thumb-on' : 'switch-thumb-off'}
                          aria-hidden
                          className={`h-5 w-5 rounded-full ${isGranted ? 'self-end bg-obsidian' : 'self-start bg-ink'}`}
                        />
                      </View>
                      <Text className="w-8 font-mono text-xs uppercase tracking-widest text-ink">
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
      </View>
    </ScrollView>
  );
}
