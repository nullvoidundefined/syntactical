// The calendar date (YYYY-MM-DD) of an instant in an IANA timezone. An
// unknown or missing timezone throws rather than falling back to UTC or the
// host zone, because a wrong date silently moves XP and streak days. The
// instant must carry `Z` or an explicit offset; one without would be read in
// the host zone.
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const formatterByTimezone = new Map<string, Intl.DateTimeFormat>();

function readFormatter(timezone: string): Intl.DateTimeFormat {
    if (typeof timezone !== 'string' || timezone === '') {
        throw new RangeError(`Invalid time zone: ${String(timezone)}`);
    }
    const cached = formatterByTimezone.get(timezone);
    if (cached) {
        return cached;
    }
    const formatter = new Intl.DateTimeFormat('en-US', {
        calendar: 'gregory',
        day: '2-digit',
        month: '2-digit',
        numberingSystem: 'latn',
        timeZone: timezone,
        year: 'numeric',
    });
    formatterByTimezone.set(timezone, formatter);
    return formatter;
}

function readPart(parts: Intl.DateTimeFormatPart[], type: 'day' | 'month' | 'year'): string {
    const part = parts.find((candidate) => candidate.type === type);
    if (!part) {
        throw new RangeError(`Missing ${type} in formatted date`);
    }
    return part.value;
}

export function toLocalDate(instant: string, timezone: string): string {
    const formatter = readFormatter(timezone);
    if (!ISO_INSTANT_PATTERN.test(instant)) {
        throw new RangeError(`Not an ISO 8601 instant with Z or an offset: ${instant}`);
    }
    const date = new Date(instant);
    if (Number.isNaN(date.getTime())) {
        throw new RangeError(`Invalid instant: ${instant}`);
    }
    const parts = formatter.formatToParts(date);
    return `${readPart(parts, 'year')}-${readPart(parts, 'month')}-${readPart(parts, 'day')}`;
}
