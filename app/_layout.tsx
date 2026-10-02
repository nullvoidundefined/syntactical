// Root layout: global styles, safe area, the query client, and the
// content and stats providers, around every route.
import '../global.css';
import { useState } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { logWarning } from '../clients/logClient';
import { createQueryClient } from '../config/queryClient';
import { validateContentBaseUrl } from '../services/content/validateContentBaseUrl';
import { ContentProvider } from '../state/ContentProvider';
import { StatsProvider } from '../state/StatsProvider';

const CONTENT_BASE_URL = validateContentBaseUrl(Constants.expoConfig?.extra?.contentBaseUrl);
if (CONTENT_BASE_URL === null) logWarning({}, 'content base URL is missing or untrusted; content fetching is disabled');

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
