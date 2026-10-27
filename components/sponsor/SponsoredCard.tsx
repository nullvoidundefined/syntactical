// The sponsored card on iOS and Android (the web build uses SponsoredCard.web.tsx), and the one place that
// reads eligibility: nothing renders unless SponsorProvider allows cards, so a Pro user never gets even the
// reserved slot. Otherwise the card sits in its fixed-height SponsoredSlot. With an AdMob unit for the
// placement (Google's test unit in a test build), it requests one non-personalised native ad per card mount,
// once consent allows, with the AdChoices icon top right, and renders it in the card frame: each asset a bare
// Text or Image directly inside its NativeAsset, no touchable wrappers and no media view. While consent or
// the ad is pending the slot shows the empty Sponsored frame, so the ad fills in place without moving
// anything. No unit id, ads unavailable, or a load error (no fill) shows the direct sponsor or the house
// card. useSponsorNativeAd owns the ad and destroys it on unmount, so an ad that arrives after the screen
// left reports nothing (Review Focus 20). ad_shown is reported after the ad has rendered; ad_clicked on the
// SDK's click event, whose listener the hook holds.
import { useCallback, useEffect, useState } from 'react';

import { Image, Text } from 'react-native';
import {
  NativeAdChoicesPlacement,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  TestIds,
} from 'react-native-google-mobile-ads';

import { readAdMobPlacement } from '../../services/sponsor/readAdMobConfig';
import type { SponsorPlacement } from '../../services/sponsor/types/SponsorPlacement';
import { useSponsor } from '../../state/SponsorProvider';

import { SPONSOR_CLASSES, SponsoredCardFrame } from './SponsoredCardFrame';
import { SponsorContentSlot } from './SponsorContentSlot';
import { SponsoredSlot, SponsoredSlotPlaceholder } from './SponsoredSlot';
import { useSponsorContent, type SponsorContentState } from './useSponsorContent';
import { useSponsorNativeAd } from './useSponsorNativeAd';

export type SponsoredCardProps = { onShown?: () => void; placement: SponsorPlacement };

const FALLBACK_CALL_TO_ACTION = 'Open';
// The native ad view takes the whole slot, so the frame's h-full resolves against the slot's fixed height.
const AD_VIEW_STYLE = { height: '100%', width: '100%' } as const;
// One options object for every request: non-personalised, AdChoices top right (the frame keeps that corner
// clear).
const AD_REQUEST_OPTIONS = {
  adChoicesPlacement: NativeAdChoicesPlacement.TOP_RIGHT,
  requestNonPersonalizedAdsOnly: true,
};

function resolveAdUnitId(placement: SponsorPlacement): string | null {
  const unit = readAdMobPlacement(placement);
  if (unit === null) return null;
  return 'adUnitId' in unit ? unit.adUnitId : TestIds.NATIVE;
}

function AdMobCard({ adUnitId, sponsor }: { adUnitId: string; sponsor: SponsorContentState }) {
  const { adsStatus } = useSponsor();
  const { onClicked, onShown } = sponsor;
  const onAdClicked = useCallback(() => onClicked('admob'), [onClicked]);
  const { error, nativeAd } = useSponsorNativeAd(adUnitId, AD_REQUEST_OPTIONS, adsStatus === 'ready', onAdClicked);

  useEffect(() => {
    if (nativeAd !== null) onShown('admob');
  }, [nativeAd, onShown]);

  if (adsStatus === 'unavailable' || error !== null) return <SponsorContentSlot sponsor={sponsor} />;
  if (nativeAd === null) return <SponsoredSlotPlaceholder />;

  const { body, callToAction, headline, icon } = nativeAd;
  const actionLabel = callToAction || FALLBACK_CALL_TO_ACTION;
  const iconAsset = icon ? (
    <NativeAsset assetType={NativeAssetType.ICON}>
      <Image aria-hidden source={{ uri: icon.url }} className={SPONSOR_CLASSES.icon} />
    </NativeAsset>
  ) : undefined;
  return (
    <NativeAdView nativeAd={nativeAd} style={AD_VIEW_STYLE}>
      <SponsoredCardFrame headline={headline} icon={iconAsset}>
        <NativeAsset assetType={NativeAssetType.HEADLINE}>
          <Text className={SPONSOR_CLASSES.headline}>{headline}</Text>
        </NativeAsset>
        {body ? (
          <NativeAsset assetType={NativeAssetType.BODY}>
            <Text numberOfLines={1} className={SPONSOR_CLASSES.body}>
              {body}
            </Text>
          </NativeAsset>
        ) : null}
        <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
          <Text
            role="link"
            aria-label={`Sponsored: ${headline}. ${actionLabel}`}
            className={SPONSOR_CLASSES.actionText}
          >
            {actionLabel}
          </Text>
        </NativeAsset>
      </SponsoredCardFrame>
    </NativeAdView>
  );
}

function NativeSponsoredCard({ onShown, placement }: SponsoredCardProps) {
  const sponsor = useSponsorContent(placement, onShown);
  const [adUnitId] = useState(() => resolveAdUnitId(placement));
  if (adUnitId === null) return <SponsorContentSlot sponsor={sponsor} />;
  return <AdMobCard adUnitId={adUnitId} sponsor={sponsor} />;
}

export function SponsoredCard(props: SponsoredCardProps) {
  const { eligibility } = useSponsor();
  if (eligibility === 'hidden') return null;
  return (
    <SponsoredSlot placement={props.placement}>
      <NativeSponsoredCard {...props} />
    </SponsoredSlot>
  );
}
