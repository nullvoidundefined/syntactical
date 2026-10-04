// Root layout: global styles, safe area, the query client, and the
// content, auth, stats, and sync providers, and the app shell, around every route.
import '../global.css';
import { useState } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { logWarning } from '../clients/logClient';
import { AccountControl } from '../components/auth/AccountControl';
import { AppShell } from '../components/layout/AppShell';
import { createQueryClient } from '../config/queryClient';
import { validateContentBaseUrl } from '../services/content/validateContentBaseUrl';
import { AuthProvider } from '../state/AuthProvider';
import { ContentProvider } from '../state/ContentProvider';
import { OwnedStatsProvider } from '../state/OwnedStatsProvider';
import { SyncProvider } from '../state/SyncProvider';

function readTrustedContentBaseUrl(): string | null {
  const contentBaseUrl = validateContentBaseUrl(Constants.expoConfig?.extra?.contentBaseUrl);
  if (contentBaseUrl === null) {
    logWarning({}, 'content base URL is missing or untrusted; content fetching is disabled');
  }
  return contentBaseUrl;
}

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const [contentBaseUrl] = useState(readTrustedContentBaseUrl);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ContentProvider contentBaseUrl={contentBaseUrl}>
          <AuthProvider>
            <OwnedStatsProvider>
              <SyncProvider>
                <AppShell accountControl={<AccountControl />}>
                  <Slot />
                </AppShell>
              </SyncProvider>
            </OwnedStatsProvider>
          </AuthProvider>
        </ContentProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
