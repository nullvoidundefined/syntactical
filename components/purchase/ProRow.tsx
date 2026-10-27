// The Pro row in Settings for a signed-in user (a guest signs in first and sees nothing here).
// A free user gets "Go Pro", which opens the Pro sheet; an annual subscriber reads "Pro until
// <date>"; a lifetime owner (or an admin grant) reads "Pro, lifetime". A Pro user gets "Manage
// subscription" on every platform whenever RevenueCat reports a management page, so a subscription
// sold on the web can be cancelled on the web. Nothing shows while the status loads or after it fails.
import { useCallback, useState } from 'react';

import { Pressable, Text, View } from 'react-native';

import { useProStatus } from '../../state/useProStatus';
import { useSubscriptionManagementUrl } from '../../state/useSubscriptionManagementUrl';
import { ExternalLink } from '../query/ExternalLink';

import { ProOffer } from './ProOffer';

function formatExpiry(expiresAt: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(expiresAt));
}

export function ProRow() {
  const proStatus = useProStatus();
  const isPro = proStatus.status === 'ready' && proStatus.isPro;
  const managementUrl = useSubscriptionManagementUrl(isPro);
  const [isOfferOpen, setIsOfferOpen] = useState(false);
  const closeOffer = useCallback(() => setIsOfferOpen(false), []);

  if (proStatus.status !== 'ready') return null;
  const { expiresAt, product } = proStatus;

  if (!isPro) {
    return (
      <View className="mt-4">
        <Pressable role="button" aria-label="Go Pro" onPress={() => setIsOfferOpen(true)}>
          <Text className="font-mono text-xs uppercase tracking-widest text-ink">Go Pro</Text>
        </Pressable>
        {isOfferOpen ? <ProOffer source="settings" onClose={closeOffer} /> : null}
      </View>
    );
  }

  const isAnnual = product === 'annual' && expiresAt !== null;
  return (
    <View className="mt-4">
      <Text className="font-mono text-xs uppercase tracking-widest text-ink">
        {isAnnual ? `Pro until ${formatExpiry(expiresAt)}` : 'Pro, lifetime'}
      </Text>
      {managementUrl === null ? null : (
        <ExternalLink className="mt-2" label="Manage subscription" url={managementUrl} />
      )}
    </View>
  );
}
