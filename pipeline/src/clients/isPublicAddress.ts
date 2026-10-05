// True only for a public unicast IP. A cited source's host must resolve to public addresses only,
// so the fetch cannot reach loopback, a private network, or a cloud metadata endpoint. Blocked:
// loopback, RFC 1918, link-local, ULA, unspecified, CGNAT, IETF protocol assignments, benchmarking,
// multicast, reserved, NAT64, documentation, IPv4-compatible, and every IPv4-mapped IPv6 address.
import { BlockList, isIP } from 'node:net';

const IPV4_BLOCKED: readonly (readonly [string, number])[] = [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
];

const IPV6_BLOCKED: readonly (readonly [string, number])[] = [
    // Covers :: (unspecified), ::1 (loopback), and the deprecated IPv4-compatible block.
    ['::', 96],
    // Every IPv4-mapped form, public or not: the connection target must be a native address.
    ['::ffff:0:0', 96],
    ['64:ff9b::', 96],
    ['2001:db8::', 32],
    ['fc00::', 7],
    ['fe80::', 10],
    ['ff00::', 8],
];

// One list per family: a BlockList also matches an IPv4 query against IPv4-mapped IPv6 rules, so
// sharing a list would let ::ffff:0:0/96 block every IPv4 address.
const blockedIpv4 = new BlockList();
for (const [network, prefix] of IPV4_BLOCKED) blockedIpv4.addSubnet(network, prefix, 'ipv4');
const blockedIpv6 = new BlockList();
for (const [network, prefix] of IPV6_BLOCKED) blockedIpv6.addSubnet(network, prefix, 'ipv6');

export function isPublicAddress(address: string): boolean {
    const family = isIP(address);
    if (family === 4) return !blockedIpv4.check(address, 'ipv4');
    if (family === 6) return !blockedIpv6.check(address, 'ipv6');
    return false;
}
