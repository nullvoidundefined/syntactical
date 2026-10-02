// Language step route. Renders the app title until the menu lands in Task 12.
import { Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-obsidian">
      <Text role="heading" aria-level={1} className="font-mono text-3xl text-ink">
        syntactical<Text className="text-signal">_</Text>
      </Text>
    </View>
  );
}
