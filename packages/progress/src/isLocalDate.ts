// True when a value is a real calendar date written as YYYY-MM-DD.
const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_LENGTH = 10;

export function isLocalDate(value: string): boolean {
    const match = LOCAL_DATE_PATTERN.exec(value);
    if (!match) {
        return false;
    }
    const [, year, month, day] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toISOString().slice(0, ISO_DATE_LENGTH) === value;
}
