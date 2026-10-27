// Root layout: global styles, safe area, the query client, and the content, auth, sponsor, stats, and sync
// providers, the review bank prefetch, and the app shell, around every route.
import '../global.css';
import { useState } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { logWarning } from '../clients/logClient';
import { AccountControl } from '../components/auth/AccountControl';
import { AppShell } from '../components/layout/AppShell';
import { PageHead } from '../components/seo/PageHead';
import { readExtraString } from '../config/readExtraString';
import { createQueryClient } from '../config/queryClient';
import { AdminCacheReset } from '../state/AdminCacheReset';
import { AuthProvider } from '../state/AuthProvider';
import { ContentProvider } from '../state/ContentProvider';
import { OwnedStatsProvider } from '../state/OwnedStatsProvider';
import { ReviewBankPrefetch } from '../state/ReviewBankPrefetch';
import { SponsorProvider } from '../state/SponsorProvider';
import { SyncProvider } from '../state/SyncProvider';

function readContentBaseUrl(): string | null {
  const contentBaseUrl = readExtraString('contentBaseUrl');
  if (contentBaseUrl === null) {
    logWarning({}, 'content base URL is missing; content fetching is disabled');
    return null;
  }
  return contentBaseUrl;
}

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const [contentBaseUrl] = useState(readContentBaseUrl);
  return (
    <SafeAreaProvider>
      <PageHead title="Syntactical" />
      <QueryClientProvider client={queryClient}>
        <ContentProvider contentBaseUrl={contentBaseUrl}>
          <AuthProvider>
            <SponsorProvider>
              <AdminCacheReset />
              <OwnedStatsProvider>
                <ReviewBankPrefetch />
                <SyncProvider>
                  <AppShell accountControl={<AccountControl />}>
                    <Slot />
                  </AppShell>
                </SyncProvider>
              </OwnedStatsProvider>
            </SponsorProvider>
          </AuthProvider>
        </ContentProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
