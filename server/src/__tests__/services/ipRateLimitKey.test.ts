// B-3.3 (B-63): the client address a rate limit counts. IPv6 clients are keyed by their /64
// prefix, since one subscriber holds the whole /64; IPv4-mapped IPv6 addresses are keyed as
// the IPv4 address they carry, so an IPv4 client counts once whichever form reaches us.
import { describe, expect, it } from 'vitest';

import { ipRateLimitKey } from '../../services/ipRateLimitKey.js';

const IPV4 = '203.0.113.7';

describe('ipRateLimitKey', () => {
  it('keys an IPv4 address as itself', () => {
    expect(ipRateLimitKey(IPV4)).toBe(IPV4);
  });

  it('unmaps IPv4-mapped IPv6 addresses in dotted and hex form, in any case', () => {
    expect(ipRateLimitKey(`::ffff:${IPV4}`)).toBe(IPV4);
    expect(ipRateLimitKey(`::FFFF:${IPV4}`)).toBe(IPV4);
    expect(ipRateLimitKey('::ffff:cb00:7107')).toBe(IPV4);
    expect(ipRateLimitKey('0:0:0:0:0:ffff:203.0.113.7')).toBe(IPV4);
  });

  it('keeps distinct mapped IPv4 addresses distinct', () => {
    expect(ipRateLimitKey('::ffff:203.0.113.7')).not.toBe(ipRateLimitKey('::ffff:203.0.113.8'));
  });

  it('keys every address in one IPv6 /64 the same, however it is written', () => {
    const key = ipRateLimitKey('2001:db8::1');

    expect(ipRateLimitKey('2001:db8::2')).toBe(key);
    expect(ipRateLimitKey('2001:0DB8:0000:0000:abcd:ef01:2345:6789')).toBe(key);
    expect(ipRateLimitKey('2001:db8:0:0:ffff:ffff:ffff:ffff')).toBe(key);
  });

  it('keys different IPv6 /64 prefixes differently', () => {
    expect(ipRateLimitKey('2001:db8:0:1::1')).not.toBe(ipRateLimitKey('2001:db8::1'));
    expect(ipRateLimitKey('2001:db9::1')).not.toBe(ipRateLimitKey('2001:db8::1'));
  });

  it('ignores an IPv6 zone index', () => {
    expect(ipRateLimitKey('fe80::1%eth0')).toBe(ipRateLimitKey('fe80::2'));
  });

  it('never keys an IPv6 /64 the same as an IPv4 address', () => {
    expect(ipRateLimitKey('::1')).not.toBe(ipRateLimitKey('0.0.0.1'));
  });

  it('keys a missing or unparseable address to one shared fallback instead of throwing', () => {
    const fallback = ipRateLimitKey(undefined);

    expect(ipRateLimitKey('not-an-address')).toBe(fallback);
    expect(ipRateLimitKey('')).toBe(fallback);
    expect(fallback).not.toBe(ipRateLimitKey(IPV4));
  });
});
