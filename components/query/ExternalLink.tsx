// A link out of the app, shown in the query drawer. On the web it is a real anchor that opens a
// new tab with rel="noopener noreferrer"; on native it opens the URL with Linking.
import { Linking, Platform, Text } from 'react-native';

// react-native-web renders a Text with href as <a>; these props are web-only, so they are not in TextProps.
type WebAnchorProps = { href: string; hrefAttrs: { rel: string; target: string } };

export function ExternalLink({ className, label, url }: { className?: string; label: string; url: string }) {
  const isWeb = Platform.OS === 'web';
  const anchorProps: WebAnchorProps | Record<string, never> = isWeb
    ? { href: url, hrefAttrs: { rel: 'noopener noreferrer', target: '_blank' } }
    : {};
  return (
    <Text
      role="link"
      {...(anchorProps as object)}
      onPress={isWeb ? undefined : () => void Linking.openURL(url)}
      className={`text-sm text-signal underline ${className ?? ''}`}
    >
      {label}
    </Text>
  );
}
