// The sponsored card's frame, in the SelectionCard idiom: a "Sponsored" label at least 15 points high as
// the first child (AdMob's attribution rule), an optional icon on the left, and the content beside it.
// The right padding keeps the top-right corner clear for the AdChoices icon the AdMob SDK draws there.
// SponsorContentCard fills the frame from a SponsorContent with a headline, one line of body, and one
// link-role button; the AdMob card wraps its own Text and Image views, styled with SPONSOR_CLASSES, in
// the SDK's asset views instead. No media view and no second body line, on any feed.
import type { ReactNode } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { SPONSOR_LABEL_MIN_HEIGHT } from '../../constants/sponsor';
import type { SponsorContent } from '../../services/sponsor/types/SponsorContent';

const ACTION_BOX = 'mt-3 self-start rounded border border-line px-4 py-2';
const ACTION_LABEL = 'font-mono text-xs uppercase tracking-widest text-signal';

export const SPONSOR_CLASSES = {
  actionBox: ACTION_BOX,
  actionLabel: ACTION_LABEL,
  // The AdMob call to action is a single Text inside its asset view, so box and label share one element.
  actionText: `${ACTION_BOX} ${ACTION_LABEL}`,
  body: 'mt-1 text-sm text-muted',
  // The frame fills its SponsoredSlot and never grows it.
  frame: 'h-full w-full overflow-hidden rounded-lg border border-line bg-surface py-4 pl-5 pr-10',
  headline: 'font-mono text-lg text-ink',
  icon: 'mr-4 h-10 w-10 rounded',
  label: 'font-mono text-xs uppercase tracking-widest text-muted',
} as const;

type SponsoredCardFrameProps = { children: ReactNode; headline: string; icon?: ReactNode };

export function SponsoredCardFrame({ children, headline, icon }: SponsoredCardFrameProps) {
  return (
    <View testID="sponsored-card" role="group" aria-label={`Sponsored: ${headline}`} className={SPONSOR_CLASSES.frame}>
      <Text className={SPONSOR_CLASSES.label} style={{ minHeight: SPONSOR_LABEL_MIN_HEIGHT }}>
        Sponsored
      </Text>
      <View className="mt-2 flex-row items-start">
        {icon ?? null}
        <View className="flex-1">{children}</View>
      </View>
    </View>
  );
}

type SponsorContentCardProps = { content: SponsorContent; onPress: () => void };

export function SponsorContentCard({ content, onPress }: SponsorContentCardProps) {
  const { body, callToAction, headline, iconUri } = content;
  const icon =
    iconUri === undefined ? undefined : (
      <Image testID="sponsored-card-icon" aria-hidden source={{ uri: iconUri }} className={SPONSOR_CLASSES.icon} />
    );
  return (
    <SponsoredCardFrame headline={headline} icon={icon}>
      <Text className={SPONSOR_CLASSES.headline}>{headline}</Text>
      <Text numberOfLines={1} className={SPONSOR_CLASSES.body}>
        {body}
      </Text>
      <Pressable
        role="link"
        aria-label={`Sponsored: ${headline}. ${callToAction}`}
        onPress={onPress}
        className={SPONSOR_CLASSES.actionBox}
      >
        <Text className={SPONSOR_CLASSES.actionLabel}>{callToAction}</Text>
      </Pressable>
    </SponsoredCardFrame>
  );
}
