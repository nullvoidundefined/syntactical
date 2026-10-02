// Shown for any URL that matches no route, including an unknown
// language or difficulty id.
import { Link } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-obsidian px-4">
      <Text role="heading" aria-level={1} className="font-mono text-2xl text-ink">
        Not found
      </Text>
      <Link href="/" role="link" className="mt-4 font-mono text-sm text-signal">
        Back to menu
      </Link>
    </View>
  );
}
