// state/__tests__/useCanAsk.test.tsx
// Asking needs only a session: a signed-in user may ask at once, Pro or not, with no GET me, and a
// guest may not.
import { randomUUID } from 'node:crypto';
import type { PropsWithChildren } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';

import { fakeAuth } from '../../components/purchase/__tests__/purchaseFlowFakes';
import { setExpoExtra } from '../../config/expoConstantsMock';
import { createQueryClient } from '../../config/queryClient';
import { settle } from '../../config/settle';
import { useCanAsk } from '../useCanAsk';

import { installRoutedFetch } from './authTestSupport';

setExpoExtra({ apiBaseUrl: 'https://api.syntactical.dev/v1/' });

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../state/AuthProvider', () =>
  require('../../components/purchase/__tests__/purchaseFlowFakes').buildAuthModule(),
);

const queryClient = createQueryClient();

function QueryWrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

afterEach(() => {
  queryClient.clear();
});

describe('useCanAsk', () => {
  it('is true for a signed-in user at once, with no request', async () => {
    fakeAuth.userId = randomUUID();
    const { requests } = installRoutedFetch({});
    const { result } = await renderHook(() => useCanAsk(), { wrapper: QueryWrapper });
    expect(result.current).toBe(true);
    await settle();
    expect(requests).toHaveLength(0);
  });

  it('is false for a guest', async () => {
    fakeAuth.userId = null;
    installRoutedFetch({});
    const { result } = await renderHook(() => useCanAsk(), { wrapper: QueryWrapper });
    expect(result.current).toBe(false);
  });
});
