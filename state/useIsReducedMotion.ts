// Whether the user asked the system to reduce motion, through reanimated's
// hook. Test environments whose reanimated mock lacks the hook (Expo
// Router's testing library installs one) read as motion allowed.
import * as Reanimated from 'react-native-reanimated';

const readReducedMotion: () => boolean =
  typeof Reanimated.useReducedMotion === 'function' ? Reanimated.useReducedMotion : () => false;

export function useIsReducedMotion(): boolean {
  return readReducedMotion();
}
