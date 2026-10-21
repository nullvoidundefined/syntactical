import { renderHook } from '@testing-library/react-native';
import { NavigationContext } from 'expo-router/build/react-navigation/core';
import type { ContextType, ReactNode } from 'react';

import { useClearOnBlur } from '../useClearOnBlur';

describe('useClearOnBlur', () => {
  it('subscribes to blur and unsubscribes on unmount', async () => {
    const onBlur = jest.fn();
    const unsubscribe = jest.fn();
    const addListener = jest.fn(() => unsubscribe);
    const fakeNavigation = { addListener } as unknown as ContextType<typeof NavigationContext>;

    function Wrapper({ children }: { children: ReactNode }) {
      return <NavigationContext.Provider value={fakeNavigation}>{children}</NavigationContext.Provider>;
    }

    const { unmount } = await renderHook(() => useClearOnBlur(onBlur), { wrapper: Wrapper });

    expect(addListener).toHaveBeenCalledTimes(1);
    expect(addListener).toHaveBeenCalledWith('blur', onBlur);
    expect(unsubscribe).not.toHaveBeenCalled();
    await unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('renders without a provider and does not call onBlur', async () => {
    const onBlur = jest.fn();
    const { unmount } = await renderHook(() => useClearOnBlur(onBlur));

    expect(onBlur).not.toHaveBeenCalled();
    await unmount();
    expect(onBlur).not.toHaveBeenCalled();
  });
});
