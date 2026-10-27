// state/__tests__/SponsorProvider.web.test.tsx
// The web build asks for no ad consent and never touches the Mobile Ads SDK: EthicalAds sets no cookies.
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';

import { mobileAdsControl, resetMobileAds } from '../../components/sponsor/__tests__/mobileAdsMock';
import { setExpoExtra } from '../../config/expoConstantsMock';
import { createQueryClient } from '../../config/queryClient';
import { settle } from '../../config/settle';
import { SponsorProvider, useSponsor } from '../SponsorProvider';

jest.mock('../useProStatus', () => ({ useProStatus: () => ({ status: 'guest' }) }));
jest.mock('../AuthProvider', () => ({ useAuth: () => ({ isHydrated: true }), useSignedInUserId: () => null }));

function Probe() {
  const { adsStatus, eligibility } = useSponsor();
  return <Text>{`${eligibility} ${adsStatus}`}</Text>;
}

describe('SponsorProvider on the web', () => {
  it('stays eligible for web cards and makes no SDK call', async () => {
    resetMobileAds();
    setExpoExtra({
      admob: { androidAppId: 'a', iosAppId: 'i', isTestAds: true, resultsAdUnitId: {}, tracksAdUnitId: {} },
      contentBaseUrl: 'https://example.test/content/',
    });
    render(
      <QueryClientProvider client={createQueryClient()}>
        <SponsorProvider>
          <Probe />
        </SponsorProvider>
      </QueryClientProvider>,
    );
    await settle();
    expect(screen.getByText('eligible unavailable')).toBeTruthy();
    expect(mobileAdsControl.calls).toEqual([]);
  });
});
