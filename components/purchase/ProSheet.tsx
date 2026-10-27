// The Syntactical Pro sheet: a modal dialog with one h1, the two benefits, a button per Pro
// product with the store's localized price (never a hard-coded one), a line on how each renews,
// and "Not now". It records paywall_viewed once per opening with where it was opened from. On the
// web with no prices and no Web Billing key it says Pro is in the mobile apps instead of offering
// buttons that cannot work. On the web the slide-in is switched off under reduced motion, focus
// moves into the sheet, Tab and Shift+Tab wrap inside it, Escape closes it, and focus returns to
// what had it. On native it is a Modal. Quiz key bindings are inert while it is open. Under the
// purchase buttons (App Store guideline 3.1.2), "Privacy policy" closes the sheet and opens
// /privacy, and "Terms of use" opens Apple's standard EULA in the browser.
import { useEffect, useRef } from 'react';

import { router } from 'expo-router';
import { Platform, Pressable, Text, View } from 'react-native';

import { trackEvent } from '../../clients/analyticsClient';
import { readExtraString } from '../../config/readExtraString';
import { PRO_DAILY_ASK_LIMIT, PRO_PRODUCT_IDS } from '../../constants/proProducts';
import { useIsReducedMotion } from '../../state/useIsReducedMotion';
import { AuthButton } from '../auth/AuthButton';
import { DialogShell } from '../layout/DialogShell';
import { useModalPanel } from '../layout/useModalPanel';
import { ExternalLink } from '../query/ExternalLink';

const HEADING_ID = 'pro-sheet-heading';
const RENEWAL_NOTE = 'A year renews until you cancel; forever is one payment.';
const WEB_UNAVAILABLE = 'Pro is available in the iOS and Android apps for now.';
const APPLE_STANDARD_EULA = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

export type ProSheetSource = 'ask_limit' | 'house_card' | 'results' | 'settings';

type ProSheetProps = {
  isBuying: boolean;
  message: string | null;
  onBuy: (productId: string) => void;
  onClose: () => void;
  prices: Readonly<Record<string, string>>;
  source: ProSheetSource;
};

function buildLabel(plan: string, price: string | undefined): string {
  return price === undefined ? plan : `${plan} for ${price}`;
}

export function ProSheet({ isBuying, message, onBuy, onClose, prices, source }: ProSheetProps) {
  const panelRef = useRef<View>(null);
  const isReducedMotion = useIsReducedMotion();
  const isWeb = Platform.OS === 'web';
  const hasPrices = Object.keys(prices).length > 0;
  const isWebUnavailable = isWeb && !hasPrices && readExtraString('revenueCatWebBillingKey') === null;
  // Read once: a later source change on the same opening records nothing new.
  const sourceRef = useRef(source);

  useEffect(() => {
    trackEvent('paywall_viewed', { source: sourceRef.current });
  }, []);
  useModalPanel(panelRef, { onClose });

  const slide = { animation: isReducedMotion ? 'none' : 'paywall-slide-up 200ms ease-out' };
  const panel = (
    <View
      className="absolute inset-0 items-center justify-end bg-obsidian/90 sm:justify-center"
      style={isWeb ? { position: 'fixed' as 'absolute' } : undefined}
    >
      <View
        ref={panelRef}
        role="dialog"
        // Native role queries (and the dialog's own announcement) need the dialog itself to be accessible.
        accessible
        aria-modal={true}
        accessibilityViewIsModal
        aria-labelledby={HEADING_ID}
        testID="pro-sheet-panel"
        tabIndex={-1}
        style={isWeb ? (slide as object) : undefined}
        className="w-full max-w-md border border-line bg-surface p-4"
      >
        <Text role="heading" aria-level={1} nativeID={HEADING_ID} className="font-mono text-lg text-ink">
          Syntactical Pro
        </Text>
        <View className="mt-3 gap-1">
          <Text className="text-sm text-ink">No sponsored cards</Text>
          <Text className="text-sm text-ink">{`${PRO_DAILY_ASK_LIMIT} asks a day`}</Text>
        </View>
        {message === null ? null : (
          <Text role="alert" className="mt-2 text-sm text-ink">
            {message}
          </Text>
        )}
        {isWebUnavailable ? (
          <Text className="mt-6 text-sm text-ink">{WEB_UNAVAILABLE}</Text>
        ) : (
          <>
            <AuthButton
              label={buildLabel('A year', prices[PRO_PRODUCT_IDS.ANNUAL])}
              isDisabled={isBuying}
              onPress={() => onBuy(PRO_PRODUCT_IDS.ANNUAL)}
            />
            <AuthButton
              label={buildLabel('Forever', prices[PRO_PRODUCT_IDS.LIFETIME])}
              isDisabled={isBuying}
              isPrimary={false}
              onPress={() => onBuy(PRO_PRODUCT_IDS.LIFETIME)}
            />
            <Text className="mt-3 text-xs text-muted">{RENEWAL_NOTE}</Text>
            <View className="mt-2 flex-row items-center gap-6">
              <Pressable
                role="link"
                aria-label="Privacy policy"
                // Like Not now, it closes the sheet, so not while a purchase runs.
                disabled={isBuying}
                onPress={() => {
                  onClose();
                  router.push('/privacy');
                }}
              >
                <Text className="text-sm text-signal underline">Privacy policy</Text>
              </Pressable>
              <ExternalLink label="Terms of use" url={APPLE_STANDARD_EULA} />
            </View>
          </>
        )}
        <AuthButton label="Not now" isDisabled={isBuying} isPrimary={false} onPress={onClose} />
      </View>
    </View>
  );

  return (
    <DialogShell animationType={isReducedMotion ? 'none' : 'slide'} onRequestClose={onClose}>
      {panel}
    </DialogShell>
  );
}
