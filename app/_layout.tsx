// Root layout: global styles, the safe-area provider, and lifetime stats
// around every route.
import '../global.css';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatsProvider } from '../state/StatsProvider';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatsProvider>
        <Slot />
      </StatsProvider>
    </SafeAreaProvider>
  );
}
