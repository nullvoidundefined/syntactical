// Root layout: global styles, safe area, the query client, and the
// content, auth, stats, and sync providers, the paid bank prefetch, and the app
// shell, around every route.
import '../global.css';
import { useState, type ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { logWarning } from '../clients/logClient';
import { AccountControl } from '../components/auth/AccountControl';
import { AppShell } from '../components/layout/AppShell';
import { createQueryClient } from '../config/queryClient';
import { AuthProvider, useAuth } from '../state/AuthProvider';
import { ContentProvider } from '../state/ContentProvider';
import { PaidBankPrefetch } from '../state/PaidBankPrefetch';
import { StatsProvider } from '../state/StatsProvider';
import { SyncProvider } from '../state/SyncProvider';

function readContentBaseUrl(): string | null {
  const contentBaseUrl: unknown = Constants.expoConfig?.extra?.contentBaseUrl;
  if (typeof contentBaseUrl !== 'string' || contentBaseUrl === '') {
    logWarning({}, 'content base URL is missing; content fetching is disabled');
    return null;
  }
  return contentBaseUrl;
}

// Stats belong to the signed-in user; a guest's are owned by no one.
function OwnedStatsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <StatsProvider ownerUserId={user?.id ?? null}>{children}</StatsProvider>;
}

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const [contentBaseUrl] = useState(readContentBaseUrl);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ContentProvider contentBaseUrl={contentBaseUrl}>
          <AuthProvider>
            <PaidBankPrefetch />
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
