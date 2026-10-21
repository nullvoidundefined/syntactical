// One build-time value from app.config.ts extra, read at call time so a test
// can swap the config: the string when it is set and non-empty, else null.
import Constants from 'expo-constants';

export function readExtraString(key: string): string | null {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const value = extra?.[key];
  return typeof value === 'string' && value !== '' ? value : null;
}
