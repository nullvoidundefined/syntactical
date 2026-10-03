// Whether a client-sent timezone is an IANA zone this runtime knows, so only a real zone is
// ever stored on a user (it decides which local day an answer counts toward).
const KNOWN_TIME_ZONES = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);

function isValidTimeZone(timeZone: string): boolean {
  return KNOWN_TIME_ZONES.has(timeZone);
}

export { isValidTimeZone };
