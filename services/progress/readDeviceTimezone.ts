// The device's IANA timezone, or UTC when the runtime reports none it can
// format dates in, so progress is never computed against an unusable zone.
import { toLocalDate } from '@syntactical/progress';

const FALLBACK_TIMEZONE = 'UTC';

export function readDeviceTimezone(): string {
  const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
  try {
    toLocalDate(new Date().toISOString(), timeZone);
    return timeZone;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}
