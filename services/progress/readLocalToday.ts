// Today's calendar date (YYYY-MM-DD) in the device's timezone. A device
// whose timezone the runtime cannot resolve falls back to the UTC date.
import { toLocalDate } from '@syntactical/progress';

import { logWarning } from '../../clients/logClient';

const ISO_DATE_LENGTH = 10;

export function readLocalToday(now: Date = new Date()): string {
  const instant = now.toISOString();
  const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
  try {
    return toLocalDate(instant, timeZone);
  } catch (err) {
    logWarning({ err, timeZone }, 'device timezone unusable, using the UTC date');
    return instant.slice(0, ISO_DATE_LENGTH);
  }
}
