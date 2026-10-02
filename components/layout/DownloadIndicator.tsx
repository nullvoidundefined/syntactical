// A thin, low-contrast line under the header while a bank downloads.
// Announced once per transfer as a polite status; static under reduced
// motion. Renders nothing when no bank is transferring.
import { useEffect, useRef } from 'react';

import { AccessibilityInfo, Animated, Easing, Platform, View } from 'react-native';

import { useContentDownloads } from '../../state/useContentDownloads';
import { useIsReducedMotion } from '../../state/useIsReducedMotion';

const STATUS_LABEL = 'Updating questions';
const SWEEP_DURATION_MS = 1400;
const SWEEP_OUTPUT_RANGE = ['-100%', '300%'];
const SWEEP_INPUT_RANGE = [0, 1];

function SweepingLine() {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const sweep = Animated.loop(
      Animated.timing(progress, { duration: SWEEP_DURATION_MS, easing: Easing.linear, toValue: 1, useNativeDriver: true }),
    );
    sweep.start();
    return () => sweep.stop();
  }, [progress]);
  const translateX = progress.interpolate({ inputRange: SWEEP_INPUT_RANGE, outputRange: SWEEP_OUTPUT_RANGE });
  return <Animated.View className="h-full w-1/3 bg-signal/40" style={{ transform: [{ translateX }] }} />;
}

export function DownloadIndicator() {
  const isDownloading = useContentDownloads();
  const isReducedMotion = useIsReducedMotion();

  useEffect(() => {
    if (isDownloading && Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(STATUS_LABEL);
  }, [isDownloading]);

  if (!isDownloading) return null;
  return (
    <View
      accessible
      role="progressbar"
      aria-label={STATUS_LABEL}
      aria-live="polite"
      accessibilityLiveRegion="polite"
      className="h-px w-full overflow-hidden bg-line"
    >
      {isReducedMotion ? <View testID="download-indicator-static" className="h-full w-full bg-signal/30" /> : <SweepingLine />}
    </View>
  );
}
