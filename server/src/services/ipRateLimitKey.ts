// The client address a rate limit counts (B-63). An IPv6 client is keyed by its /64 prefix,
// since one subscriber is routinely handed the whole /64 and could otherwise rotate through
// it; an IPv4-mapped IPv6 address (::ffff:a.b.c.d, dotted or hex) is keyed as the IPv4
// address it carries, so an IPv4 client counts once whichever form reaches the server.
// A missing or unparseable address shares one fallback bucket rather than escaping the limit.
import { isIPv4, isIPv6 } from 'node:net';

const FALLBACK_KEY = 'unknown';
const IPV6_GROUP_COUNT = 8;
const SLASH_64_GROUP_COUNT = 4;
const MAPPED_PREFIX = '0:0:0:0:0:ffff';
const MAPPED_PREFIX_GROUP_COUNT = 6;
const HEX_RADIX = 16;
const BYTE_SIZE = 256;

// An IPv6 address as its eight groups, lowercase hex with no leading zeros.
function ipv6Groups(address: string): string[] {
  let text = address.toLowerCase();
  const lastColon = text.lastIndexOf(':');
  const dottedTail = text.slice(lastColon + 1);
  if (isIPv4(dottedTail)) {
    const [first = 0, second = 0, third = 0, fourth = 0] = dottedTail.split('.').map(Number);
    const high = (first * BYTE_SIZE + second).toString(HEX_RADIX);
    const low = (third * BYTE_SIZE + fourth).toString(HEX_RADIX);
    text = `${text.slice(0, lastColon + 1)}${high}:${low}`;
  }
  const [head = '', tail] = text.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const zeroGroups =
    tail === undefined ? [] : Array.from({ length: IPV6_GROUP_COUNT - headGroups.length - tailGroups.length }, () => '0');
  return [...headGroups, ...zeroGroups, ...tailGroups].map((group) => Number.parseInt(group, HEX_RADIX).toString(HEX_RADIX));
}

function unmappedIpv4(groups: string[]): string {
  const [high = 0, low = 0] = groups.slice(MAPPED_PREFIX_GROUP_COUNT).map((group) => Number.parseInt(group, HEX_RADIX));
  return [Math.floor(high / BYTE_SIZE), high % BYTE_SIZE, Math.floor(low / BYTE_SIZE), low % BYTE_SIZE].join('.');
}

function ipRateLimitKey(ip: string | undefined): string {
  const [address = ''] = (ip ?? '').split('%');
  if (isIPv4(address)) {
    return address;
  }
  if (!isIPv6(address)) {
    return FALLBACK_KEY;
  }
  const groups = ipv6Groups(address);
  if (groups.slice(0, MAPPED_PREFIX_GROUP_COUNT).join(':') === MAPPED_PREFIX) {
    return unmappedIpv4(groups);
  }
  return `${groups.slice(0, SLASH_64_GROUP_COUNT).join(':')}::/64`;
}

export { ipRateLimitKey };
