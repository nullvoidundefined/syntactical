// Root layout: global styles, safe area, the query client, and the
// content and stats providers, around every route.
import '../global.css';
import { QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Slot } from 'expo-router';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createQueryClient } from '../config/queryClient';
import { ContentProvider } from '../state/ContentProvider';
import { StatsProvider } from '../state/StatsProvider';

const CONTENT_BASE_URL = Constants.expoConfig?.extra?.contentBaseUrl as string;

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ContentProvider contentBaseUrl={CONTENT_BASE_URL}>
          <StatsProvider>
            <Slot />
          </StatsProvider>
        </ContentProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
