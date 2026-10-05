// A link between the sign-in and sign-up routes. On web an href makes it a real <a>, so
// Enter activates it; react-native-web reads it, native ignores it, and the types do not
// declare it. The press handler owns navigation, so the browser's own link navigation is
// cancelled; a modified or non-primary click (new tab or window) is left to the browser.
import { router, type Href } from 'expo-router';
import { Pressable, Text } from 'react-native';

type AuthLinkProps = {
  href: string;
  label: string;
};

type PressEvent = {
  button?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  preventDefault?: () => void;
  shiftKey?: boolean;
};

function openLink(href: string, event?: PressEvent) {
  if (event?.metaKey || event?.ctrlKey || event?.shiftKey) return;
  if (typeof event?.button === 'number' && event.button !== 0) return;
  event?.preventDefault?.();
  router.push(href as Href);
}

export function AuthLink({ href, label }: AuthLinkProps) {
  const webLinkProps = { href } as object;
  return (
    <Pressable
      role="link"
      aria-label={label}
      {...webLinkProps}
      onPress={(event) => openLink(href, event)}
      className="mt-6 self-start py-1"
    >
      <Text className="font-mono text-xs uppercase tracking-widest text-ink">{label}</Text>
    </Pressable>
  );
}
