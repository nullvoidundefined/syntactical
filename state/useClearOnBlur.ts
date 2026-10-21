// Runs onBlur when the screen loses focus, e.g. when another route is pushed over it in a
// stack. Outside a navigator there is no focus to lose, so nothing is subscribed.
import { useContext, useEffect } from 'react';

// useFocusEffect from expo-router throws outside a navigator, and screens are rendered bare in
// many tests; the path is internal to expo-router ~57 and the CI web bundle (e2e job) verifies
// it resolves.
import { NavigationContext } from 'expo-router/build/react-navigation/core';

export function useClearOnBlur(onBlur: () => void): void {
  const navigation = useContext(NavigationContext);
  useEffect(() => navigation?.addListener('blur', onBlur), [navigation, onBlur]);
}
